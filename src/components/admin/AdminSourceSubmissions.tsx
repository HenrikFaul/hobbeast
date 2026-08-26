import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The review queue for sources providers submitted from their own dashboard.
 * Approving one writes it straight into the collector registry; nothing a
 * provider submits reaches the catalogue before that.
 */

interface Submission {
  id: string;
  publisher_name: string;
  endpoint_url: string;
  strategy: string;
  city: string | null;
  categories: string[] | null;
  note: string | null;
  detected_events: number;
  status: string;
  source_id: string | null;
  created_at: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  render: 'böngészős betöltés',
  rss: 'hírfolyam',
  tribe: 'esemény-API',
  site: 'egyedi adapter',
  ics: 'naptár-feed',
  'wp-ics-calendar': 'naptár-rács',
  jsonld: 'strukturált adat',
  'wp-posts': 'cikkekből',
  'page-prose': 'egy esemény oldala',
};

export function AdminSourceSubmissions({ refreshToken = 0 }: { refreshToken?: number }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('source-manager', {
      body: { action: 'submissions', status: 'pending' },
    });
    setLoading(false);
    if (error) return;
    setSubmissions(((data as { submissions?: Submission[] })?.submissions ?? []));
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const review = async (id: string, approve: boolean) => {
    setBusyId(id);
    const { error } = await supabase.functions.invoke('source-manager', {
      body: { action: 'review', id, approve },
    });
    setBusyId(null);
    if (error) {
      toast.error('A döntést nem sikerült rögzíteni.');
      return;
    }
    toast.success(approve ? 'Jóváhagyva — a forrás bekerült a gyűjtésbe.' : 'Elutasítva.');
    void load();
  };

  // A queue nobody filled is not worth a card.
  if (!loading && submissions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span>Beküldött források ({submissions.length})</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Frissítés
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Betöltés…</p>}
        {submissions.map((submission) => (
          <div key={submission.id} className="rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{submission.publisher_name}</span>
              <Badge variant="secondary" className="text-[10px]">
                {STRATEGY_LABELS[submission.strategy] ?? submission.strategy}
              </Badge>
              {submission.detected_events > 0 && (
                <Badge variant="outline" className="text-[10px]">{submission.detected_events} program</Badge>
              )}
              {submission.city && <span className="text-xs text-muted-foreground">{submission.city}</span>}
            </div>
            <a
              href={submission.endpoint_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-xs text-primary underline-offset-2 hover:underline"
            >
              {submission.endpoint_url}
            </a>
            {submission.note && <p className="mt-1 text-xs text-muted-foreground">„{submission.note}”</p>}
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busyId === submission.id} onClick={() => void review(submission.id, true)}>
                {busyId === submission.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Jóváhagyás
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === submission.id}
                onClick={() => void review(submission.id, false)}
              >
                <X className="mr-1 h-4 w-4" /> Elutasítás
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
