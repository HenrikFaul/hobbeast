import { useCallback, useEffect, useState } from 'react';
import { Coins, MousePointerClick, RefreshCw, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface PartnerRow {
  source_id: string;
  publisher_name: string;
  city: string | null;
  live_programs: number;
  clicks: number;
  distinct_members: number;
  ticket_value_huf: number;
  commission_low_huf: number;
  commission_high_huf: number;
}

interface TopEvent {
  title: string;
  event_date: string;
  clicks: number;
  price_min: number | null;
  currency: string | null;
}

interface PartnerPerformance {
  window_days: number;
  totals: {
    clicks: number;
    distinct_events: number;
    distinct_members: number;
    ticket_value_huf: number;
    priced_clicks: number;
  };
  partners: PartnerRow[];
  top_events: TopEvent[];
  daily: Array<{ day: string; clicks: number; ticket_value_huf: number }>;
}

const numberFormat = new Intl.NumberFormat('hu-HU');
const hufFormat = new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 });

export function AdminPartnerPerformance() {
  const [data, setData] = useState<PartnerPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: rpcError } = await supabase.rpc('admin_partner_performance', { p_days: 30 });
    if (rpcError) {
      setError(rpcError.message);
      setData(null);
    } else {
      setData(result as unknown as PartnerPerformance);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Partner teljesítmény betöltése…</p>;
  if (error) return <p className="text-sm text-destructive">Nem sikerült betölteni: {error}</p>;
  if (!data) return null;

  const { totals, partners, top_events: topEvents } = data;
  const withClicks = partners.filter((p) => p.clicks > 0);
  const visible = showAll ? partners : partners.slice(0, 25);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Store className="h-5 w-5 text-primary" aria-hidden="true" /> Partner teljesítmény és bevételi potenciál
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Az elmúlt {data.window_days} nap kimenő jegy- és infókattintásai partnerekre bontva. Ez a jutalékalapú
            együttműködés mérési alapja: enélkül nem lehet forgalom után elszámolni.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> Frissítés
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Kimenő kattintás', numberFormat.format(totals.clicks), `${numberFormat.format(totals.distinct_events)} programra`],
          ['Érdeklődő tag', numberFormat.format(totals.distinct_members), 'bejelentkezett kattintók'],
          ['Kattintás mögötti jegyérték', hufFormat.format(totals.ticket_value_huf), `${numberFormat.format(totals.priced_clicks)} áras kattintásból`],
          ['Jutalékpotenciál (5–8%)',
            `${hufFormat.format(Math.round(totals.ticket_value_huf * 0.05))} – ${hufFormat.format(Math.round(totals.ticket_value_huf * 0.08))}`,
            'becslés, nem könyvelt bevétel'],
        ].map(([label, value, hint]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {totals.clicks === 0 && (
        <Card className="border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">Még nincs mért kimenő kattintás.</p>
            <p className="mt-1 text-muted-foreground">
              A mérés mostantól él: minden „Megnézem” gombnyomás rögzül a programkártyán és a részletes oldalon is.
              A partnereknek szóló kimutatás az első kattintásokkal kezd feltöltődni.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MousePointerClick className="h-4 w-4" aria-hidden="true" />
            Partnerek ({withClicks.length} aktív a {partners.length} élő programot kínálóból)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Partner</th>
              <th className="py-2 pr-3">Élő program</th>
              <th className="py-2 pr-3">Kattintás</th>
              <th className="py-2 pr-3">Érdeklődő</th>
              <th className="py-2 pr-3">Jegyérték</th>
              <th className="py-2">Jutalékpotenciál</th>
            </tr></thead>
            <tbody>{visible.map((p) => (
              <tr key={p.source_id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <p className="font-medium">{p.publisher_name}</p>
                  {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                </td>
                <td className="py-2 pr-3">{numberFormat.format(p.live_programs)}</td>
                <td className="py-2 pr-3">
                  {p.clicks > 0
                    ? <Badge className="text-[11px]">{numberFormat.format(p.clicks)}</Badge>
                    : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="py-2 pr-3">{numberFormat.format(p.distinct_members)}</td>
                <td className="py-2 pr-3">{p.ticket_value_huf > 0 ? hufFormat.format(p.ticket_value_huf) : '—'}</td>
                <td className="py-2">
                  {p.ticket_value_huf > 0
                    ? <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-500">
                        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                        {hufFormat.format(p.commission_low_huf)} – {hufFormat.format(p.commission_high_huf)}
                      </span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {partners.length > 25 && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Kevesebb mutatása' : `Mind a ${partners.length} partner mutatása`}
            </Button>
          )}
        </CardContent>
      </Card>

      {topEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Legkeresettebb programok</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Program</th><th className="py-2 pr-3">Dátum</th>
                <th className="py-2 pr-3">Kattintás</th><th className="py-2">Jegyár</th>
              </tr></thead>
              <tbody>{topEvents.map((e) => (
                <tr key={`${e.title}:${e.event_date}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{e.title}</td>
                  <td className="py-2 pr-3">{e.event_date}</td>
                  <td className="py-2 pr-3">{numberFormat.format(e.clicks)}</td>
                  <td className="py-2">{e.price_min ? `${numberFormat.format(e.price_min)} ${e.currency || ''}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        A jutalékpotenciál a monetizációs terv 5–8%-os sávjával számolt <strong>becslés</strong> a kattintás
        pillanatában ismert jegyárak alapján; nem tényleges eladás és nem könyvelt bevétel. Tényleges elszámoláshoz
        a partnerrel kötött megállapodás és a jegyértékesítői visszaigazolás szükséges.
      </p>
    </div>
  );
}

export default AdminPartnerPerformance;
