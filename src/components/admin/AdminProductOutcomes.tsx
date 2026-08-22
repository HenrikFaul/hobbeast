import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Loader2, RefreshCw, UsersRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface OutcomeRow {
  outcome_day: string;
  event_name: string;
  event_count: number;
}

const LABELS: Record<string, string> = {
  verified_or_confirmed_real_world_participation: 'Megerősített valós részvétel',
  completed: 'Befejezett részvétel',
  post_event_feedback: 'Esemény utáni visszajelzés',
  reconnection_mutual: 'Kölcsönös újrakapcsolódás',
  circle_joined: 'Körhöz csatlakozás',
  organizer_event_completed: 'Szervező által lezárt esemény',
  event_join: 'Esemény RSVP',
  waitlist_joined: 'Várólista-csatlakozás',
};

export function AdminProductOutcomes() {
  const [rows, setRows] = useState<OutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.rpc('admin_product_outcomes', { _days: 30 });
    if (queryError) {
      setRows([]);
      setError('Az outcome nézet nem tölthető be. Ellenőrizd a Prompt 15 migrációt és az admin jogosultságot.');
    } else {
      setRows((data || []) as OutcomeRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => rows.reduce<Record<string, number>>((result, row) => {
    result[row.event_name] = (result[row.event_name] || 0) + Number(row.event_count || 0);
    return result;
  }, {}), [rows]);
  const northStar = totals.verified_or_confirmed_real_world_participation || 0;
  const supporting = [
    'completed',
    'reconnection_mutual',
    'circle_joined',
    'organizer_event_completed',
    'post_event_feedback',
  ];

  return (
    <section aria-labelledby="product-outcome-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="product-outcome-heading" className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" /> Valós közösségi outcome-ok
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            30 napos, pszeudonimizált termék-telemetria. A north-star egy viselkedési proxy, nem pszichológiai vagy kapcsolati minősítés.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Frissítés
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Outcome adatok nem elérhetők</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Outcome adatok betöltése…
        </div>
      ) : !error && rows.length === 0 ? (
        <Card><CardContent className="flex min-h-40 flex-col items-center justify-center text-center">
          <UsersRound className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nincs engedélyezett analytics adat az elmúlt 30 napból.</p>
          <p className="mt-1 text-sm text-muted-foreground">Ez elvárt, amíg az analytics flag és az explicit hozzájárulás nincs bekapcsolva.</p>
        </CardContent></Card>
      ) : !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-primary/40 sm:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Meaningful Real-World Connections Created</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold font-display" aria-label={`${northStar} megerősített valós részvétel`}>{northStar}</p>
                <p className="mt-1 text-xs text-muted-foreground">Proxy: megerősített vagy hitelesített valós részvétel.</p>
              </CardContent>
            </Card>
            {supporting.map((eventName) => (
              <Card key={eventName}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{LABELS[eventName]}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold font-display">{totals[eventName] || 0}</p></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Napi aggregátum <Badge variant="outline">PII nélkül</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Nap</TableHead><TableHead>Outcome</TableHead><TableHead className="text-right">Darab</TableHead></TableRow></TableHeader>
                  <TableBody>{rows.map((row) => (
                    <TableRow key={`${row.outcome_day}:${row.event_name}`}>
                      <TableCell>{new Date(row.outcome_day).toLocaleDateString('hu-HU')}</TableCell>
                      <TableCell>{LABELS[row.event_name] || row.event_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.event_count}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                A safety/performance guardrailok külön operációs dashboardot igényelnek; ez a nézet önmagában nem GO bizonyíték.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
