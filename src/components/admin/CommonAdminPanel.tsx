import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, RefreshCw, ScrollText, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COMMON_ADMIN_HOSTS, COMMON_ADMIN_INTEGRATIONS, COMMON_ADMIN_RELEASE } from "@/lib/commonAdminMetadata";

interface LocalStatus {
  totalRows: number;
  state: { status?: string; last_run_started_at?: string | null; last_run_completed_at?: string | null; last_error?: string | null; } | null;
}

export function CommonAdminPanel() {
  const [catalogStatus, setCatalogStatus] = useState<LocalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'status' } });
      if (error) throw error;
      setCatalogStatus((data as LocalStatus) || null);
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült lekérni a common admin státuszt');
    }
    setLoading(false);
  };
  useEffect(() => { void refreshStatus(); }, []);
  return (
    <div className="space-y-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 font-display text-lg"><Settings className="h-5 w-5 text-primary" /> Common Admin - integrációk és hosting</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">{COMMON_ADMIN_HOSTS.map((row) => <div key={row.label} className="rounded-lg border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p><p className="mt-2 font-semibold">{row.value}</p><p className="mt-2 text-xs text-muted-foreground">{row.description}</p></div>)}</div>
          <div className="grid gap-4 lg:grid-cols-3">{COMMON_ADMIN_INTEGRATIONS.map((group) => <div key={group.title} className="rounded-lg border bg-card p-4"><p className="font-medium">{group.title}</p><div className="mt-3 space-y-2">{group.providers.map((provider) => <div key={provider.name} className="flex items-start justify-between gap-3 rounded-md border p-2"><div><p className="text-sm font-medium">{provider.name}</p><p className="text-xs text-muted-foreground">{provider.detail}</p></div><Badge variant={provider.active ? 'default' : 'secondary'}>{provider.active ? 'Aktív' : 'Inaktív'}</Badge></div>)}</div></div>)}</div>
        </CardContent></Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ScrollText className="h-4 w-4 text-primary" /> Alkalmazásverzió és szállított funkciók</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Verzió</div><div className="text-2xl font-semibold">{COMMON_ADMIN_RELEASE.version}</div></div><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Deployment idő</div><div className="text-sm font-medium">{COMMON_ADMIN_RELEASE.deployedAt}</div></div></div><div className="rounded-lg border p-4"><p className="text-sm font-medium">Changelogból összefoglalt leszállított funkciók</p><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{COMMON_ADMIN_RELEASE.delivered.map((item) => <li key={item}>• {item}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{COMMON_ADMIN_RELEASE.notes}</p></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" /> Operatív státusz - lokális címtábla</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Rekordok</div><div className="text-2xl font-semibold">{catalogStatus?.totalRows ?? 0}</div></div><div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Sync állapot</div><div className="text-lg font-semibold">{catalogStatus?.state?.status || 'ismeretlen'}</div></div></div><div className="space-y-1 text-xs text-muted-foreground"><p>Utolsó start: {catalogStatus?.state?.last_run_started_at || '—'}</p><p>Utolsó befejezés: {catalogStatus?.state?.last_run_completed_at || '—'}</p>{catalogStatus?.state?.last_error ? <p className="text-destructive">Utolsó hiba: {catalogStatus.state.last_error}</p> : null}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refreshStatus} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Állapot frissítése</Button><Badge variant="secondary">A provider választás és import tesztek az Import tabon élnek</Badge></div></CardContent></Card></div>
    </div>
  );
}
