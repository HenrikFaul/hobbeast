import { useCallback, useEffect, useState } from 'react';
import { HeartHandshake, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EngagementStats {
  window_days: number;
  funnel: {
    new_members: number;
    members_with_first_join: number;
    median_days_to_first_join: number | null;
    returning_members_30d: number;
  };
  piggyback: {
    intents_total: number;
    intents_active: number;
    looking_for_company: number;
    distinct_events: number;
    distinct_members: number;
  };
  hubs: Record<string, number>;
  activity: Array<{ event_name: string; count: number }>;
  feedback: {
    responses: number;
    note?: string;
    avg_mood?: number | null;
    met_new_people_pct?: number | null;
    want_to_meet_again_pct?: number | null;
    would_return_pct?: number | null;
  };
  source_health: {
    runs: number;
    failed_runs: number;
    http_errors: number;
    sources_with_failures: number;
  };
}

export function AdminEngagementFunnel() {
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_engagement_stats', { p_days: 30 });
    if (rpcError) {
      setError(rpcError.message);
      setStats(null);
    } else {
      setStats(data as unknown as EngagementStats);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Kapcsolódási tölcsér betöltése…</p>;
  if (error) return <p className="text-sm text-destructive">A kapcsolódási tölcsér nem tölthető be: {error}</p>;
  if (!stats) return null;

  const { funnel, piggyback, feedback, hubs, source_health } = stats;
  const hubEntries = Object.entries(hubs || {});

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-primary" aria-hidden="true" />
            Kapcsolódási tölcsér ({stats.window_days} nap)
          </span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> Frissítés
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Új tag', funnel.new_members, 'regisztráció az időszakban'],
            ['Első részvétel', funnel.members_with_first_join,
              funnel.median_days_to_first_join !== null
                ? `medián ${funnel.median_days_to_first_join} nap regisztrációtól`
                : 'még nincs mérhető medián'],
            ['Visszatérő tag (30 nap)', funnel.returning_members_30d, 'legalább 2 különböző eseményen'],
            ['Társkereső jelzés külső programra', piggyback.intents_active,
              `${piggyback.distinct_members} tag · ${piggyback.distinct_events} program`],
          ].map(([label, value, hint]) => (
            <div key={String(label)} className="rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold font-display">{value as number}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Kapcsolódás-minőség (esemény utáni visszajelzés)
            </p>
            {feedback.note ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {feedback.responses} válasz — a részletes bontás legalább 3 válasznál jelenik meg (anonimitás-védelem).
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">Hangulat: {feedback.avg_mood ?? '–'} / 5</Badge>
                <Badge variant="outline">Új ismerős: {feedback.met_new_people_pct ?? '–'}%</Badge>
                <Badge variant="outline">Újra találkozna: {feedback.want_to_meet_again_pct ?? '–'}%</Badge>
                <Badge variant="outline">Visszatérne: {feedback.would_return_pct ?? '–'}%</Badge>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hub-aktivációs szakaszok · forrás-egészség
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {hubEntries.length === 0
                ? <Badge variant="secondary">Hub-aktiváció még nincs</Badge>
                : hubEntries.map(([stage, count]) => (
                  <Badge key={stage} variant="outline">{stage}: {count}</Badge>
                ))}
              <Badge variant={source_health.failed_runs > 0 ? 'destructive' : 'outline'}>
                Begyűjtő futások: {source_health.runs} · hibás: {source_health.failed_runs}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminEngagementFunnel;
