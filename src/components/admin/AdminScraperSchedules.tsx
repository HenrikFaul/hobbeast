import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';

interface Schedule {
  id: string;
  name: string;
  run_at_hours: number[];
  days_of_week: number[] | null;
  source_ids: string[] | null;
  sources_per_run: number;
  details_per_source: number;
  enabled: boolean;
  last_triggered_at: string | null;
  last_status: string | null;
}

const DAY_LABELS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatWhen(value: string | null) {
  if (!value) return 'még nem futott';
  try {
    return new Date(value).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

interface AdminScraperSchedulesProps {
  /** Currently ticked sources on the destinations table, for "selected only" schedules. */
  selectedSourceIds: string[];
}

export function AdminScraperSchedules({ selectedSourceIds }: AdminScraperSchedulesProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_scraper_schedules');
    if (error) toast.error('Az időzítések nem tölthetők be.');
    else setSchedules((data as unknown as Schedule[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const newDraft = (withSelection: boolean) => setDraft({
    id: '', name: withSelection ? `Kijelölt ${selectedSourceIds.length} forrás` : 'Új időzítés',
    run_at_hours: [8], days_of_week: null,
    source_ids: withSelection ? [...selectedSourceIds] : null,
    sources_per_run: 40, details_per_source: 40, enabled: true,
    last_triggered_at: null, last_status: null,
  });

  const save = async () => {
    if (!draft || !draft.run_at_hours.length) {
      toast.error('Legalább egy órát válassz ki.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('admin_upsert_scraper_schedule', {
      p_id: draft.id || null,
      p_name: draft.name.trim() || 'Időzítés',
      p_run_at_hours: draft.run_at_hours,
      p_days_of_week: draft.days_of_week,
      p_source_ids: draft.source_ids,
      p_sources_per_run: draft.sources_per_run,
      p_details_per_source: draft.details_per_source,
      p_enabled: draft.enabled,
    });
    setSaving(false);
    if (error) { toast.error('Mentés sikertelen.'); return; }
    toast.success('Időzítés mentve.');
    setDraft(null);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.rpc('admin_delete_scraper_schedule', { p_id: id });
    if (error) toast.error('Törlés sikertelen.');
    else { toast.success('Időzítés törölve.'); void load(); }
  };

  const toggleEnabled = async (schedule: Schedule) => {
    const { error } = await supabase.rpc('admin_upsert_scraper_schedule', {
      p_id: schedule.id,
      p_name: schedule.name,
      p_run_at_hours: schedule.run_at_hours,
      p_days_of_week: schedule.days_of_week,
      p_source_ids: schedule.source_ids,
      p_sources_per_run: schedule.sources_per_run,
      p_details_per_source: schedule.details_per_source,
      p_enabled: !schedule.enabled,
    });
    if (error) toast.error('A módosítás nem sikerült.');
    else void load();
  };

  const toggleIn = (list: number[] | null, value: number): number[] | null => {
    const current = list || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value].sort((a, b) => a - b);
    return next.length ? next : null;
  };

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" /> Időzített begyűjtések
          </span>
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => newDraft(false)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Új időzítés
            </Button>
            {selectedSourceIds.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => newDraft(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Kijelöltekre ({selectedSourceIds.length})
              </Button>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Az időzítések az adatbázis órás ütemezőjén futnak (Európa/Budapest idő szerint); nem kell hozzá külön beállítás.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Időzítések betöltése…</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs időzítés.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Név</th><th className="py-2 pr-3">Órák</th><th className="py-2 pr-3">Napok</th>
                <th className="py-2 pr-3">Források</th><th className="py-2 pr-3">Utolsó indítás</th>
                <th className="py-2 pr-3">Aktív</th><th className="py-2"></th>
              </tr></thead>
              <tbody>{schedules.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  <td className="py-2 pr-3">{s.run_at_hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')}</td>
                  <td className="py-2 pr-3">{s.days_of_week ? s.days_of_week.map((d) => DAY_LABELS[d - 1]).join(', ') : 'minden nap'}</td>
                  <td className="py-2 pr-3">
                    {s.source_ids?.length
                      ? <Badge variant="secondary" className="text-[10px]">{s.source_ids.length} kijelölt</Badge>
                      : <Badge variant="outline" className="text-[10px]">automatikus ({s.sources_per_run})</Badge>}
                  </td>
                  <td className="py-2 pr-3">{formatWhen(s.last_triggered_at)}</td>
                  <td className="py-2 pr-3">
                    <Switch checked={s.enabled} onCheckedChange={() => void toggleEnabled(s)} aria-label={`${s.name} be- vagy kikapcsolása`} />
                  </td>
                  <td className="py-2">
                    <span className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDraft(s)}>Szerkeszt</Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(s.id)} aria-label={`${s.name} törlése`}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {draft && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-card/60 p-3">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Időzítés neve"
              aria-label="Időzítés neve"
              className="max-w-sm"
            />
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mikor fusson (óra)</p>
              <div className="flex flex-wrap gap-1">
                {HOURS.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    size="sm"
                    variant={draft.run_at_hours.includes(h) ? 'default' : 'outline'}
                    className="h-7 w-11 px-0 text-xs"
                    onClick={() => setDraft({ ...draft, run_at_hours: toggleIn(draft.run_at_hours, h) || [] })}
                  >
                    {String(h).padStart(2, '0')}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mely napokon (üres = minden nap)</p>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, index) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={draft.days_of_week?.includes(index + 1) ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => setDraft({ ...draft, days_of_week: toggleIn(draft.days_of_week, index + 1) })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="mb-1 block font-medium uppercase tracking-wide text-muted-foreground">Források / futás</span>
                <Input
                  type="number" min={1} max={100} className="h-8 w-24"
                  value={draft.sources_per_run}
                  onChange={(e) => setDraft({ ...draft, sources_per_run: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium uppercase tracking-wide text-muted-foreground">Aloldal / forrás</span>
                <Input
                  type="number" min={1} max={100} className="h-8 w-24"
                  value={draft.details_per_source}
                  onChange={(e) => setDraft({ ...draft, details_per_source: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                />
              </label>
              {draft.source_ids?.length ? (
                <Badge variant="secondary">{draft.source_ids.length} kijelölt forrásra</Badge>
              ) : (
                <Badge variant="outline">automatikus forgó</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? 'Mentés…' : 'Mentés'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Mégse</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminScraperSchedules;
