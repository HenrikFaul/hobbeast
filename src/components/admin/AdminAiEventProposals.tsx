import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Eye, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

interface Proposal {
  id: string;
  hub_id: string;
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'published' | 'cancelled';
  title: string;
  description: string;
  activity: string | null;
  suggested_start: string;
  suggested_end: string;
  city: string;
  venue_category: string;
  target_capacity: number;
  demand_reason: string;
  confidence: number;
  generation_mode: 'provider' | 'deterministic_fallback' | 'manual';
  moderation_status: string;
  organizer_id: string | null;
  venue_validation_status: string;
  venue_name: string | null;
  venue_address: string | null;
  host_responsibility_accepted_at: string | null;
  moderation_reviewed_by: string | null;
  moderation_reviewed_at: string | null;
  venue_verified_by: string | null;
  venue_verified_at: string | null;
  published_event_id: string | null;
  created_at: string;
}

interface PreviewHub {
  snapshot: { hub_id: string; activity: string; coarse_city: string; real_member_count: number };
  status: 'qualified' | 'excluded';
  reasons: string[];
  confidence: number;
}

interface Preview {
  qualified_hubs: number;
  excluded_hubs: number;
  hubs: PreviewHub[];
  safeguards: { auto_publish: false; kill_switch: boolean; k_anonymity: number };
}

export function AdminAiEventProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [organizerById, setOrganizerById] = useState<Record<string, string>>({});
  const [venueNameById, setVenueNameById] = useState<Record<string, string>>({});
  const [venueAddressById, setVenueAddressById] = useState<Record<string, string>>({});
  const [publishConfirmation, setPublishConfirmation] = useState<Record<string, string>>({});

  const invoke = useCallback(async <T,>(body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('ai-event-proposals', { body });
    if (invokeError) throw invokeError;
    return data as T;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<{ proposals: Proposal[] }>({ action: 'list', limit: 100 });
      setProposals(response.proposals);
    } catch (loadError) {
      console.error('AI proposals load failed', loadError);
      setError('Az AI proposal queue nem tölthető be. Nincs automatikus publikálás.');
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  const runPreview = async () => {
    setWorking('preview');
    try {
      const response = await invoke<Preview>({ action: 'preview' });
      setPreview(response);
    } catch (previewError) {
      console.error('AI demand preview failed', previewError);
      toast.error('A privacy-safe demand előnézet nem tölthető be.');
    } finally {
      setWorking(null);
    }
  };

  const createDrafts = async () => {
    setWorking('create');
    try {
      const response = await invoke<{ proposal_count: number; fallback_count: number; auto_published: 0 }>({
        action: 'create', idempotency_key: `manual-proposal-run:${crypto.randomUUID()}`,
      });
      toast.success(`${response.proposal_count} draft készült; ${response.fallback_count} determinisztikus fallback. Publikálva: 0.`);
      void trackProductEvent('auto_event_proposed', {
        source: 'ai_proposal', surface: 'admin_control_plane', status: response.fallback_count > 0 ? 'fallback' : 'draft',
        count_bucket: String(response.proposal_count),
      });
      await load();
    } catch (createError) {
      console.error('AI proposal generation failed', createError);
      toast.error('A draft generálás tiltott, kikapcsolt vagy elérte a napi keretet.');
    } finally {
      setWorking(null);
    }
  };

  const transition = async (
    proposal: Proposal,
    nextStatus: 'review' | 'approved' | 'rejected' | 'cancelled',
    gate?: 'moderation' | 'venue',
  ) => {
    const reason = reasonById[proposal.id]?.trim();
    if (!reason || reason.length < 3) return toast.error('Az admin döntéshez indok szükséges.');
    setWorking(proposal.id);
    try {
      await invoke({
        action: 'transition', proposal_id: proposal.id, next_status: nextStatus, reason,
        organizer_id: organizerById[proposal.id]?.trim() || proposal.organizer_id,
        moderation_status: gate === 'moderation' ? 'passed' : null,
        venue_validation_status: gate === 'venue' ? 'verified' : null,
        venue_name: venueNameById[proposal.id]?.trim() || proposal.venue_name,
        venue_address: venueAddressById[proposal.id]?.trim() || proposal.venue_address,
        human_edits: { admin_reason_recorded: true },
      });
      toast.success('A proposal állapota frissült.');
      await load();
    } catch (transitionError) {
      console.error('AI proposal transition failed', transitionError);
      toast.error(nextStatus === 'approved'
        ? 'Jóváhagyás blokkolva: szervezői elfogadás, moderáció és ellenőrzött helyszín is szükséges.'
        : 'Az állapotátmenet nem engedélyezett.');
    } finally {
      setWorking(null);
    }
  };

  const publish = async (proposal: Proposal) => {
    if (publishConfirmation[proposal.id] !== `PUBLISH ${proposal.id}`) {
      return toast.error('A publikáláshoz írd be pontosan a megerősítő szöveget.');
    }
    setWorking(proposal.id);
    try {
      const response = await invoke<{ event_id: string }>({ action: 'publish', proposal_id: proposal.id });
      void trackProductEvent('auto_event_published', {
        event_id: response.event_id, source: 'ai_proposal', surface: 'admin_control_plane', status: 'published',
      });
      toast.success(`Az ember által jóváhagyott esemény publikálva: ${response.event_id}`);
      await load();
    } catch (publishError) {
      console.error('AI proposal publish failed', publishError);
      toast.error('A publikálási gate blokkolta a műveletet.');
    } finally {
      setWorking(null);
    }
  };

  if (loading) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (error) return <Card role="alert"><CardContent className="py-8 text-center space-y-3"><AlertTriangle className="h-8 w-8 text-destructive mx-auto" /><p>{error}</p><Button variant="outline" onClick={() => void load()}>Újrapróbálás</Button></CardContent></Card>;

  return (
    <div className="space-y-5">
      <Card><CardHeader><CardTitle className="font-display flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> AI demand és proposal workflow</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">draft → review → approved → published</Badge><Badge variant="secondary">auto publish: OFF</Badge><Badge variant="outline">k-anonim aggregátum</Badge></div>
        <p className="text-sm text-muted-foreground">A szolgáltató csak draftot javasol. Szervezői elfogadás, moderáció, helyszínellenőrzés és külön admin publish szükséges.</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void runPreview()} disabled={working === 'preview'}><Eye className="h-4 w-4 mr-2" />Demand előnézet</Button><Button onClick={() => void createDrafts()} disabled={working === 'create'}><Send className="h-4 w-4 mr-2" />Draft proposalok létrehozása</Button><Button variant="ghost" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-2" />Frissítés</Button></div>
        {preview && <div className="rounded-xl border p-3 space-y-2"><div className="flex flex-wrap gap-2"><Badge>{preview.qualified_hubs} qualified</Badge><Badge variant="outline">{preview.excluded_hubs} kizárva</Badge><Badge variant={preview.safeguards.kill_switch ? 'destructive' : 'secondary'}>kill switch: {preview.safeguards.kill_switch ? 'ON' : 'OFF'}</Badge></div>{preview.hubs.slice(0, 10).map((hub) => <p className="text-xs" key={hub.snapshot.hub_id}><strong>{hub.snapshot.activity}</strong> · {hub.snapshot.coarse_city} · {hub.snapshot.real_member_count} valódi · {hub.status}: {hub.reasons.join(', ')}</p>)}</div>}
      </CardContent></Card>

      {proposals.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">Nincs proposal. A feature flag és a kill switch alapértelmezetten blokkolja a generálást.</CardContent></Card> : proposals.map((proposal) => (
        <Card key={proposal.id}>
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-3"><div><div className="flex flex-wrap gap-2 mb-1"><Badge>{proposal.status}</Badge><Badge variant="outline">{proposal.generation_mode}</Badge><Badge variant="outline">{Math.round(proposal.confidence * 100)}%</Badge><Badge variant={proposal.moderation_reviewed_by ? 'secondary' : 'outline'}>moderáció: {proposal.moderation_reviewed_by ? 'ellenőrizve' : 'függő'}</Badge><Badge variant={proposal.venue_verified_by ? 'secondary' : 'outline'}>helyszín: {proposal.venue_verified_by ? 'külön reviewer' : 'függő'}</Badge></div><h3 className="font-semibold">{proposal.title}</h3><p className="text-sm text-muted-foreground">{proposal.city} · {new Date(proposal.suggested_start).toLocaleString('hu-HU')} · max. {proposal.target_capacity} fő</p></div><Badge variant={proposal.host_responsibility_accepted_at ? 'secondary' : 'destructive'}>szervező: {proposal.host_responsibility_accepted_at ? 'elfogadta' : 'függőben'}</Badge></div>
            <p className="text-sm">{proposal.description}</p><p className="text-xs text-muted-foreground"><strong>Aggregált indok:</strong> {proposal.demand_reason}</p>
            {!['published', 'cancelled'].includes(proposal.status) && <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label htmlFor={`reason-${proposal.id}`}>Admin döntés indoka</Label><Textarea id={`reason-${proposal.id}`} value={reasonById[proposal.id] || ''} onChange={(event) => setReasonById((current) => ({ ...current, [proposal.id]: event.target.value }))} maxLength={1000} /></div>
              <div className="space-y-2"><Label htmlFor={`organizer-${proposal.id}`}>Szervező immutable user ID</Label><Input id={`organizer-${proposal.id}`} value={organizerById[proposal.id] ?? proposal.organizer_id ?? ''} onChange={(event) => setOrganizerById((current) => ({ ...current, [proposal.id]: event.target.value }))} /><Label htmlFor={`venue-name-${proposal.id}`}>Ellenőrzött helyszín neve</Label><Input id={`venue-name-${proposal.id}`} value={venueNameById[proposal.id] ?? proposal.venue_name ?? ''} onChange={(event) => setVenueNameById((current) => ({ ...current, [proposal.id]: event.target.value }))} /><Label htmlFor={`venue-address-${proposal.id}`}>Ellenőrzött cím</Label><Input id={`venue-address-${proposal.id}`} value={venueAddressById[proposal.id] ?? proposal.venue_address ?? ''} onChange={(event) => setVenueAddressById((current) => ({ ...current, [proposal.id]: event.target.value }))} /></div>
            </div>}
            <div className="flex flex-wrap gap-2">
              {proposal.status === 'draft' && <Button variant="outline" disabled={working === proposal.id} onClick={() => void transition(proposal, 'review')}>Reviewba küldés</Button>}
              {proposal.status === 'review' && <><Button variant="outline" disabled={working === proposal.id} onClick={() => void transition(proposal, 'review')}>Review adatok mentése</Button><Button variant="outline" disabled={working === proposal.id || Boolean(proposal.moderation_reviewed_by)} onClick={() => void transition(proposal, 'review', 'moderation')}>Moderáció ellenőrizve</Button><Button variant="outline" disabled={working === proposal.id || !proposal.moderation_reviewed_by || Boolean(proposal.venue_verified_by)} onClick={() => void transition(proposal, 'review', 'venue')}>Helyszín külön ellenőrzése</Button><Button disabled={working === proposal.id || !proposal.moderation_reviewed_by || !proposal.venue_verified_by} onClick={() => void transition(proposal, 'approved')}><ShieldCheck className="h-4 w-4 mr-1" />Jóváhagyás gate</Button><Button variant="destructive" disabled={working === proposal.id} onClick={() => void transition(proposal, 'rejected')}>Elutasítás</Button></>}
            </div>
            {proposal.status === 'approved' && <div className="rounded-xl border border-destructive/30 p-3 space-y-2"><Label htmlFor={`publish-${proposal.id}`}>Kétlépcsős megerősítés: <code>PUBLISH {proposal.id}</code></Label><Input id={`publish-${proposal.id}`} value={publishConfirmation[proposal.id] || ''} onChange={(event) => setPublishConfirmation((current) => ({ ...current, [proposal.id]: event.target.value }))} /><Button variant="destructive" disabled={working === proposal.id} onClick={() => void publish(proposal)}>Ember által jóváhagyott esemény publikálása</Button></div>}
            {proposal.published_event_id && <p className="text-sm text-muted-foreground">Publikált event ID: <code>{proposal.published_event_id}</code></p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
