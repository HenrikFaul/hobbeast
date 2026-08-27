import { useCallback, useEffect, useState } from 'react';
import { Check, Compass, ExternalLink, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sources the collector found by itself.
 *
 * Every one of the 309 registered hosts was added by hand. The sites we
 * already read link outward constantly, and those links are the best-qualified
 * leads there are — they come from a site that already publishes Hungarian
 * programmes. The worker harvests them during a normal run; this is where a
 * person decides what to do with them.
 *
 * Deliberately a decision list, not an automation: promoting a host into the
 * collector stays a human act, and the reasons are shown so the operator can
 * disagree with the score.
 */

interface Candidate {
  host: string;
  url: string;
  score: number;
  reasons: string[] | null;
  times_seen: number;
  discovered_from_url: string | null;
  link_text: string | null;
  status: string;
  last_seen_at: string;
}

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function scoreTone(score: number): 'default' | 'secondary' | 'outline' {
  if (score >= 60) return 'default';
  if (score >= 40) return 'secondary';
  return 'outline';
}

export function AdminSourceDiscovery() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await rpc.rpc('admin_list_source_candidates', { p_status: 'new', p_limit: 50 });
    setCandidates(Array.isArray(data) ? data as Candidate[] : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const judge = async (host: string, decision: 'promote' | 'reject', publisherName?: string) => {
    setBusy(host);
    const { error } = await rpc.rpc('admin_judge_source_candidate', {
      p_host: host,
      p_decision: decision,
      p_publisher_name: publisherName ?? null,
    });
    setBusy(null);

    if (error) {
      toast.error(error.message.includes('CAPABILITY_REQUIRED')
        ? 'Ehhez providers.manage jogosultság kell.'
        : 'A művelet nem sikerült.');
      return;
    }
    toast.success(decision === 'promote'
      ? 'Felvéve a gyűjtendő források közé.'
      : 'Elvetve — többé nem ajánljuk fel.');
    // Drop it from the list straight away rather than waiting for a reload.
    setCandidates((current) => current.filter((candidate) => candidate.host !== host));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-5 w-5 text-primary" aria-hidden="true" /> Felderített források
          {candidates.length > 0 && (
            <Badge variant="secondary" className="ml-1 rounded-full">{candidates.length}</Badge>
          )}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          A gyűjtő futás közben kigyűjti a már ismert oldalakról kifelé mutató
          hivatkozásokat, és pontozza, mennyire tűnnek programoldalnak. A döntés
          a tiéd — semmi nem kerül be automatikusan.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
          </p>
        ) : candidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            Most nincs új jelölt. A következő gyűjtés után nézz vissza — minden
            futás termel újakat, ha talál olyan oldalt, amit még nem ismerünk.
          </p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((candidate) => (
              <li key={candidate.host} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={scoreTone(candidate.score)} className="rounded-full">
                        {candidate.score}
                      </Badge>
                      <p className="truncate font-medium">{candidate.host}</p>
                      {candidate.times_seen > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {candidate.times_seen}× hivatkozva
                        </span>
                      )}
                    </div>

                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {candidate.url.slice(0, 72)}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>

                    {(candidate.reasons?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.reasons!.join(' · ')}
                      </p>
                    )}
                    {candidate.discovered_from_url && (
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        Innen: {candidate.discovered_from_url.slice(0, 60)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={busy === candidate.host}
                      onClick={() => void judge(candidate.host, 'promote', candidate.link_text ?? undefined)}
                    >
                      {busy === candidate.host
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Check className="h-4 w-4" aria-hidden="true" />}
                      <span className="ml-1">Felveszem</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === candidate.host}
                      onClick={() => void judge(candidate.host, 'reject')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{candidate.host} elvetése</span>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminSourceDiscovery;
