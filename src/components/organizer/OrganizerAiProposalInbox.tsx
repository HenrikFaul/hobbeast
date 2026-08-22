import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

interface OrganizerProposal {
  id: string;
  status: 'review' | 'approved';
  title: string;
  description: string;
  activity: string | null;
  suggested_start: string;
  suggested_end: string;
  city: string;
  area_hint: string | null;
  venue_category: string;
  target_capacity: number;
  demand_reason: string;
  confidence: number;
  venue_name: string | null;
  venue_address: string | null;
  host_responsibility_accepted_at: string | null;
}

export function OrganizerAiProposalInbox() {
  const [proposals, setProposals] = useState<OrganizerProposal[]>([]);
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('organizer-ai-proposals', { body: { action: 'list' } });
      if (invokeError) throw invokeError;
      void trackProductEvent('auto_event_proposed', {
        event_id: proposal.id, source: 'ai_proposal', surface: 'organizer_dashboard',
        status: accepted ? 'organizer_accepted' : 'organizer_rejected',
      });
      setProposals((data?.proposals || []) as OrganizerProposal[]);
    } catch (loadError) {
      console.error('Organizer proposal load failed', loadError);
      setError('A szervezői AI-javaslatok most nem tölthetők be.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (proposal: OrganizerProposal, accepted: boolean) => {
    const reason = declineReasons[proposal.id]?.trim() || '';
    if (!accepted && reason.length < 3) return toast.error('Elutasításkor rövid indok szükséges.');
    setWorking(proposal.id);
    try {
      const { error: invokeError } = await supabase.functions.invoke('organizer-ai-proposals', {
        body: { action: 'decision', proposal_id: proposal.id, accepted, reason: reason || null },
      });
      if (invokeError) throw invokeError;
      toast.success(accepted ? 'Elfogadtad a házigazdai felelősséget. Az admin review folytatódik.' : 'A javaslatot elutasítottad.');
      await load();
    } catch (decisionError) {
      console.error('Organizer proposal decision failed', decisionError);
      toast.error('A döntés mentése sikertelen.');
    } finally {
      setWorking(null);
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <Card role="alert"><CardContent className="py-6 text-center space-y-3"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Újrapróbálás</Button></CardContent></Card>;
  if (proposals.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="font-display flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Szervezői eseményjavaslatok</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Ezek aggregált közösségi igényből készült draftok. Elfogadásod nem publikál eseményt; admin review, moderáció és helyszínellenőrzés még kötelező.</p>
        {proposals.map((proposal) => (
          <div key={proposal.id} className="rounded-xl border p-4 space-y-3">
            <div className="flex flex-wrap gap-2"><Badge>{proposal.status}</Badge><Badge variant="outline">{Math.round(proposal.confidence * 100)}% aggregált confidence</Badge>{proposal.host_responsibility_accepted_at && <Badge variant="secondary">elfogadva</Badge>}</div>
            <div><h3 className="font-semibold">{proposal.title}</h3><p className="text-sm text-muted-foreground">{proposal.city} · {new Date(proposal.suggested_start).toLocaleString('hu-HU')} · max. {proposal.target_capacity} fő</p></div>
            <p className="text-sm">{proposal.description}</p><p className="text-xs text-muted-foreground">{proposal.demand_reason}</p>
            {!proposal.host_responsibility_accepted_at && <><Textarea aria-label="Elutasítás indoka" placeholder="Elutasítás indoka (elfogadásnál üresen hagyható)" value={declineReasons[proposal.id] || ''} onChange={(event) => setDeclineReasons((current) => ({ ...current, [proposal.id]: event.target.value }))} maxLength={1000} /><div className="flex flex-wrap gap-2"><Button disabled={working === proposal.id} onClick={() => void decide(proposal, true)}><CheckCircle2 className="h-4 w-4 mr-1" />Házigazdai felelősség elfogadása</Button><Button variant="destructive" disabled={working === proposal.id} onClick={() => void decide(proposal, false)}><XCircle className="h-4 w-4 mr-1" />Elutasítás</Button></div></>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
