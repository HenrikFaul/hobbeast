import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, RefreshCw, ScrollText, Settings, CheckCircle, XCircle, Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COMMON_ADMIN_HOSTS, COMMON_ADMIN_INTEGRATIONS, COMMON_ADMIN_RELEASE } from "@/lib/commonAdminMetadata";
import { searchPlaces } from "@/lib/placeSearch";
import { isAwsLocationConfigured, suggestPlaces } from "@/lib/awsLocation";

interface LocalStatus {
  totalRows: number;
  state: { status?: string; last_run_started_at?: string | null; last_run_completed_at?: string | null; last_error?: string | null; } | null;
}

interface TestResult {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
  details?: string;
  durationMs?: number;
}

const INTEGRATION_TESTS: { key: string; name: string; group: string }[] = [
  { key: 'eventbrite_token', name: 'Eventbrite token', group: 'Esemény providerek' },
  { key: 'ticketmaster_preview', name: 'Ticketmaster preview', group: 'Esemény providerek' },
  { key: 'seatgeek_preview', name: 'SeatGeek preview', group: 'Esemény providerek' },
  { key: 'aws_places', name: 'Amazon AWS Places V2', group: 'Hely / cím providerek' },
  { key: 'geoapify_tomtom', name: 'Geoapify + TomTom', group: 'Hely / cím providerek' },
  { key: 'local_catalog', name: 'Lokális címtábla', group: 'Hely / cím providerek' },
  { key: 'mapy_routing', name: 'Mapy.cz útvonaltervezés', group: 'Hely / cím providerek' },
  { key: 'supabase_db', name: 'Supabase DB kapcsolat', group: 'Alkalmazás infrastruktúra' },
  { key: 'supabase_auth', name: 'Supabase Auth', group: 'Alkalmazás infrastruktúra' },
];

async function runIntegrationTest(key: string): Promise<{ ok: boolean; message: string; details?: string }> {
  const start = Date.now();

  try {
    switch (key) {
      case 'eventbrite_token': {
        const { data, error } = await supabase.functions.invoke('eventbrite-import', {
          body: { action: 'validate_token' },
        });
        if (error) throw new Error(error.message);
        if (data?.ok) return { ok: true, message: 'Token érvényes', details: `Webhook ID: ${data?.config?.webhook_id || 'nincs'}` };
        return { ok: false, message: `Token hiba: ${data?.status || 'ismeretlen'}`, details: JSON.stringify(data?.response, null, 2) };
      }

      case 'ticketmaster_preview': {
        const { data, error } = await supabase.functions.invoke('sync-ticketmaster-events', {
          body: { action: 'search_preview', params: { keyword: 'Budapest', countryCode: 'HU', size: 2, page: 0 } },
        });
        if (error) throw new Error(error.message);
        const count = Array.isArray(data?.events) ? data.events.length : 0;
        if (count > 0) return { ok: true, message: `${count} esemény elérhető`, details: data.events.map((e: any) => e.title).join(', ') };
        return { ok: false, message: 'Nem érkezett találat', details: JSON.stringify(data, null, 2) };
      }

      case 'seatgeek_preview': {
        const { data, error } = await supabase.functions.invoke('sync-seatgeek-events', {
          body: { action: 'search_preview', params: { q: 'Budapest', perPage: 2, page: 1 } },
        });
        if (error) throw new Error(error.message);
        const count = Array.isArray(data?.events) ? data.events.length : 0;
        if (count > 0) return { ok: true, message: `${count} esemény elérhető`, details: data.events.map((e: any) => e.title).join(', ') };
        return { ok: false, message: 'Nem érkezett találat', details: JSON.stringify(data, null, 2) };
      }

      case 'aws_places': {
        if (!isAwsLocationConfigured()) return { ok: false, message: 'AWS Location API kulcs nincs konfigurálva', details: 'VITE_AWS_LOCATION_API_KEY és VITE_AWS_LOCATION_REGION szükséges.' };
        const results = await suggestPlaces('Budapest');
        if (results.length > 0) return { ok: true, message: `${results.length} találat`, details: results.slice(0, 3).map((r: any) => r.text || r.place?.label).join(', ') };
        return { ok: false, message: 'Nem érkezett találat az AWS-ről' };
      }

      case 'geoapify_tomtom': {
        const results = await searchPlaces('Budapest kávézó', undefined, undefined, 'geoapify_tomtom');
        if (results.length > 0) return { ok: true, message: `${results.length} találat`, details: results.slice(0, 3).map(r => `${r.name} (${r.source})`).join(', ') };
        return { ok: false, message: 'Nem érkezett találat a Geoapify/TomTom-ról' };
      }

      case 'local_catalog': {
        const results = await searchPlaces('Budapest', undefined, undefined, 'local_catalog');
        if (results.length > 0) return { ok: true, message: `${results.length} találat`, details: results.slice(0, 3).map(r => r.name).join(', ') };
        return { ok: false, message: 'Nem érkezett találat a lokális katalógusból' };
      }

      case 'mapy_routing': {
        const { data, error } = await supabase.functions.invoke('mapy-routing', {
          body: {
            action: 'route',
            params: {
              start: { lat: 47.4979, lon: 19.0402 },
              end: { lat: 47.5, lon: 19.05 },
              routeType: 'foot_fast',
            },
          },
        });
        if (error) throw new Error(error.message);
        if (data?.geometry || data?.length) return { ok: true, message: `Útvonal OK: ${data?.length || '?'} m`, details: `Időtartam: ${Math.round((data?.duration || 0) / 60)} perc` };
        if (data?.error) return { ok: false, message: data.error, details: JSON.stringify(data, null, 2) };
        return { ok: true, message: 'Mapy.cz API elérhető', details: JSON.stringify(data).slice(0, 200) };
      }

      case 'supabase_db': {
        const { data, error } = await supabase.from('hobby_categories').select('id').limit(1);
        if (error) return { ok: false, message: `DB hiba: ${error.message}`, details: error.details || error.hint || '' };
        return { ok: true, message: 'Adatbázis elérhető', details: `Teszt lekérdezés sikeres (hobby_categories)` };
      }

      case 'supabase_auth': {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) return { ok: false, message: `Auth hiba: ${error.message}` };
        if (session) return { ok: true, message: 'Auth session aktív', details: `User: ${session.user.email}` };
        return { ok: true, message: 'Auth szolgáltatás elérhető (nincs aktív session)' };
      }

      default:
        return { ok: false, message: `Ismeretlen teszt: ${key}` };
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'Ismeretlen hiba', details: err.stack?.slice(0, 300) };
  }
}

export function CommonAdminPanel() {
  const [catalogStatus, setCatalogStatus] = useState<LocalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const refreshStatus = async (silent = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'status' } });
      if (error) throw error;
      setCatalogStatus((data as LocalStatus) || null);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Nem sikerült lekérni a common admin státuszt');
      else console.error('common admin status failed', err);
    }
    setLoading(false);
  };

  useEffect(() => { void refreshStatus(true); }, []);

  const runSingleTest = async (key: string, name: string) => {
    setTestResults((prev) => ({ ...prev, [key]: { name, status: 'running' } }));
    const start = Date.now();
    const result = await runIntegrationTest(key);
    setTestResults((prev) => ({
      ...prev,
      [key]: {
        name,
        status: result.ok ? 'success' : 'error',
        message: result.message,
        details: result.details,
        durationMs: Date.now() - start,
      },
    }));
  };

  const runAllTests = async () => {
    for (const test of INTEGRATION_TESTS) {
      await runSingleTest(test.key, test.name);
    }
  };

  const groups = [...new Set(INTEGRATION_TESTS.map((t) => t.group))];
  const integrationCategoryOrder = [
    { key: 'events', title: 'Esemény providerek' },
    { key: 'places', title: 'Hely / cím providerek' },
    { key: 'infra', title: 'Alkalmazás infrastruktúra' },
  ] as const;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Settings className="h-5 w-5 text-primary" /> Common Admin - integrációk és hosting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            {COMMON_ADMIN_HOSTS.map((row) => (
              <div key={row.label} className="rounded-lg border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                <p className="mt-2 font-semibold">{row.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{row.description}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {integrationCategoryOrder.map((group) => (
              <div key={group.key} className="rounded-lg border bg-card p-4">
                <p className="font-medium">{group.title}</p>
                <div className="mt-3 space-y-2">
                  {COMMON_ADMIN_INTEGRATIONS
                    .filter((provider) => provider.category === group.key)
                    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
                    .map((provider) => (
                    <div key={provider.name} className="flex items-start justify-between gap-3 rounded-md border p-2">
                      <div>
                        <p className="text-sm font-medium">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.detail}</p>
                      </div>
                      <Badge variant={provider.active ? 'default' : 'secondary'}>
                        {provider.active ? 'Aktív' : 'Inaktív'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Integration tests card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4 text-primary" /> Integráció tesztek
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAllTests} variant="default">
              <Play className="mr-1 h-4 w-4" /> Összes teszt futtatása
            </Button>
          </div>

          {groups.map((groupName) => (
            <div key={groupName} className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{groupName}</p>
              <div className="space-y-1">
                {INTEGRATION_TESTS.filter((t) => t.group === groupName).map((test) => {
                  const result = testResults[test.key];
                  return (
                    <div key={test.key} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{test.name}</p>
                        {result?.message && (
                          <p className={`text-xs mt-0.5 ${result.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {result.message}
                          </p>
                        )}
                        {result?.status === 'error' && result.details && (
                          <details className="mt-1">
                            <summary className="text-xs text-destructive cursor-pointer">Részletek mutatása</summary>
                            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">{result.details}</pre>
                          </details>
                        )}
                        {result?.status === 'success' && result.details && (
                          <p className="text-xs text-muted-foreground mt-0.5">{result.details}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result?.durationMs != null && (
                          <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
                        )}
                        {result?.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        {result?.status === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {result?.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                        {(!result || result.status === 'idle') && (
                          <Button size="sm" variant="ghost" onClick={() => runSingleTest(test.key, test.name)}>
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                        {result && result.status !== 'running' && (
                          <Button size="sm" variant="ghost" onClick={() => runSingleTest(test.key, test.name)}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-primary" /> Alkalmazásverzió és szállított funkciók
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Verzió</div><div className="text-2xl font-semibold">{COMMON_ADMIN_RELEASE.version}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Deployment idő</div><div className="text-sm font-medium">{COMMON_ADMIN_RELEASE.deployedAt}</div></div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">Changelogból összefoglalt leszállított funkciók</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {COMMON_ADMIN_RELEASE.delivered.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{COMMON_ADMIN_RELEASE.notes}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Operatív státusz - lokális címtábla
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Rekordok</div><div className="text-2xl font-semibold">{catalogStatus?.totalRows ?? 0}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Sync állapot</div><div className="text-lg font-semibold">{catalogStatus?.state?.status || 'ismeretlen'}</div></div>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Utolsó start: {catalogStatus?.state?.last_run_started_at || '—'}</p>
              <p>Utolsó befejezés: {catalogStatus?.state?.last_run_completed_at || '—'}</p>
              {catalogStatus?.state?.last_error ? <p className="text-destructive">Utolsó hiba: {catalogStatus.state.last_error}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { void refreshStatus(); }} disabled={loading}>
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Állapot frissítése
              </Button>
              <Badge variant="secondary">A provider választás és import tesztek az Import tabon élnek</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
