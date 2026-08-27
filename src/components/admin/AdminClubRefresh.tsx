import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  adminDeleteClubRefreshSchedule,
  adminListClubRefresh,
  adminSetClubDirectoryEnabled,
  adminUpsertClubDirectory,
  adminUpsertClubRefreshSchedule,
  deriveClubsFromProgrammes,
  type ClubDirectory,
  type ClubRefreshSchedule,
} from '@/lib/clubOperations';

/**
 * When the club catalogue refreshes, and from where.
 *
 * The hours and days set here are read hourly by run_due_club_refresh_schedules(),
 * which dispatches the harvest workflow — the same mechanism the programme
 * collector already uses, so there is one way to schedule things, not two.
 */

const DAY_LABELS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
const HOURS = Array.from({ length: 24 }, (_, index) => index);

const KIND_LABELS: Record<string, string> = {
  sport: 'Sport',
  community: 'Közösségi',
  nature: 'Természetjárás',
  derived: 'Származtatott',
};

function formatWhen(value: string | null) {
  if (!value) return 'még nem futott';
  try {
    return new Date(value).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

const EMPTY_DIRECTORY = {
  key: '', label: '', city: '', listUrl: '', note: '',
};

export function AdminClubRefresh() {
  const [schedules, setSchedules] = useState<ClubRefreshSchedule[]>([]);
  const [directories, setDirectories] = useState<ClubDirectory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClubRefreshSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [newDirectory, setNewDirectory] = useState(EMPTY_DIRECTORY);
  const [deriving, setDeriving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await adminListClubRefresh();
      setSchedules(payload.schedules);
      setDirectories(payload.directories);
    } catch (loadError) {
      const code = loadError instanceof Error ? loadError.message : '';
      setError(code === 'CAPABILITY_REQUIRED'
        ? 'Ehhez a providers.manage jogosultság kell.'
        : 'Az ütemezések most nem tölthetők be.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveSchedule = async () => {
    if (!draft) return;
    if (!draft.runAtHours.length) { toast.error('Legalább egy órát válassz ki.'); return; }
    setSaving(true);
    try {
      await adminUpsertClubRefreshSchedule({
        id: draft.id || null,
        name: draft.name.trim() || 'Névtelen ütemezés',
        runAtHours: draft.runAtHours,
        daysOfWeek: draft.daysOfWeek,
        directoryKeys: draft.directoryKeys,
        enabled: draft.enabled,
      });
      toast.success('Ütemezés mentve.');
      setDraft(null);
      await load();
    } catch {
      toast.error('Az ütemezést nem sikerült menteni.');
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async (schedule: ClubRefreshSchedule) => {
    try {
      await adminDeleteClubRefreshSchedule(schedule.id);
      toast.success('Ütemezés törölve.');
      await load();
    } catch {
      toast.error('A törlés nem sikerült.');
    }
  };

  const toggleDirectory = async (directory: ClubDirectory) => {
    try {
      await adminSetClubDirectoryEnabled(directory.key, !directory.enabled);
      await load();
    } catch {
      toast.error('A katalógus állapotát nem sikerült módosítani.');
    }
  };

  const addDirectory = async () => {
    if (!newDirectory.key.trim() || !newDirectory.label.trim() || !newDirectory.listUrl.trim()) {
      toast.error('Kulcs, név és lista-URL kötelező.');
      return;
    }
    setSaving(true);
    try {
      await adminUpsertClubDirectory({
        key: newDirectory.key.trim(),
        label: newDirectory.label.trim(),
        kind: 'community',
        harvestKind: 'community_page',
        listUrl: newDirectory.listUrl.trim(),
        city: newDirectory.city.trim() || null,
        note: newDirectory.note.trim() || null,
      });
      toast.success('Katalógus felvéve. A következő futásnál már gyűjt belőle.');
      setNewDirectory(EMPTY_DIRECTORY);
      await load();
    } catch (addError) {
      const code = addError instanceof Error ? addError.message : '';
      toast.error(code === 'INVALID_KEY'
        ? 'A kulcs csak kisbetű, szám és kötőjel lehet.'
        : 'A katalógust nem sikerült felvenni.');
    } finally {
      setSaving(false);
    }
  };

  const runDerive = async () => {
    setDeriving(true);
    try {
      const result = await deriveClubsFromProgrammes();
      toast.success(`Kész: ${result.inserted} új klubjelölt, ${result.updated} frissítve.`);
      await load();
    } catch {
      toast.error('A származtatás nem futott le.');
    } finally {
      setDeriving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" /> Klubfrissítés ütemezése
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Óránként fut egy ellenőrzés; az itt beállított órákban indítja a gyűjtést.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Frissítés
            </Button>
            <Button
              size="sm"
              onClick={() => setDraft({
                id: '', name: 'Új ütemezés', runAtHours: [4], daysOfWeek: null,
                directoryKeys: null, enabled: true, lastTriggeredAt: null, lastStatus: null,
              })}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Új ütemezés
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
            </p>
          ) : schedules.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nincs ütemezés. A katalógus így csak kézzel frissül.</p>
          ) : (
            <ul className="space-y-2">
              {schedules.map((schedule) => (
                <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{schedule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {schedule.runAtHours.map((hour) => `${hour}:00`).join(', ')}
                      {' · '}
                      {schedule.daysOfWeek?.length
                        ? schedule.daysOfWeek.map((day) => DAY_LABELS[day - 1]).join(', ')
                        : 'minden nap'}
                      {' · '}
                      {schedule.directoryKeys?.length
                        ? `${schedule.directoryKeys.length} katalógus`
                        : 'minden katalógus'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Utoljára: {formatWhen(schedule.lastTriggeredAt)}
                      {schedule.lastStatus ? ` · ${schedule.lastStatus}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!schedule.enabled && <Badge variant="outline" className="text-[11px]">Kikapcsolva</Badge>}
                    <Button size="sm" variant="outline" onClick={() => setDraft(schedule)}>Szerkesztés</Button>
                    <Button size="sm" variant="ghost" aria-label="Ütemezés törlése" onClick={() => void removeSchedule(schedule)}>
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {draft && (
            <div className="space-y-4 rounded-xl border border-primary/20 bg-secondary/40 p-4">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Az ütemezés neve"
                className="h-10"
              />
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Órák</p>
                <div className="flex flex-wrap gap-1">
                  {HOURS.map((hour) => (
                    <Button
                      key={hour}
                      size="sm"
                      variant={draft.runAtHours.includes(hour) ? 'default' : 'outline'}
                      className="h-8 w-11 px-0 text-xs"
                      onClick={() => setDraft({
                        ...draft,
                        runAtHours: draft.runAtHours.includes(hour)
                          ? draft.runAtHours.filter((value) => value !== hour)
                          : [...draft.runAtHours, hour].sort((a, b) => a - b),
                      })}
                    >
                      {hour}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Napok <span className="font-normal normal-case tracking-normal">(üres = minden nap)</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((label, index) => {
                    const day = index + 1;
                    const active = draft.daysOfWeek?.includes(day) ?? false;
                    return (
                      <Button
                        key={label}
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        className="h-8 px-3 text-xs"
                        onClick={() => {
                          const current = draft.daysOfWeek || [];
                          const next = active ? current.filter((value) => value !== day) : [...current, day].sort();
                          setDraft({ ...draft, daysOfWeek: next.length ? next : null });
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Katalógusok <span className="font-normal normal-case tracking-normal">(üres = mind)</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {directories.filter((d) => d.harvestKind !== 'none').map((directory) => {
                    const active = draft.directoryKeys?.includes(directory.key) ?? false;
                    return (
                      <Button
                        key={directory.key}
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        className="h-8 text-xs"
                        onClick={() => {
                          const current = draft.directoryKeys || [];
                          const next = active
                            ? current.filter((value) => value !== directory.key)
                            : [...current, directory.key];
                          setDraft({ ...draft, directoryKeys: next.length ? next : null });
                        }}
                      >
                        {directory.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} />
                Bekapcsolva
              </label>
              <div className="flex gap-2">
                <Button onClick={() => void saveSchedule()} disabled={saving}>Mentés</Button>
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Mégsem</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Katalógusok</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Ahonnan a klubok jönnek. Egy közösségi katalógus egy „Klubjaink" oldal címe —
            felvenni elég ide beírni, nincs hozzá kódmódosítás.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {directories.map((directory) => (
              <li key={directory.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{directory.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {KIND_LABELS[directory.kind] || directory.kind}
                    {directory.city ? ` · ${directory.city}` : ''}
                    {' · '}{directory.clubs} klub
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Utoljára: {formatWhen(directory.lastRunAt)}
                    {directory.lastResult
                      ? ` · új ${directory.lastResult.inserted ?? 0}, frissítve ${directory.lastResult.updated ?? 0}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {directory.listUrl && (
                    <a href={directory.listUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" /> Forrás
                    </a>
                  )}
                  {directory.harvestKind === 'none' && (
                    <Badge variant="outline" className="text-[11px]">Nem gyűjt</Badge>
                  )}
                  <Switch checked={directory.enabled} onCheckedChange={() => void toggleDirectory(directory)} />
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-3 rounded-xl border border-primary/20 bg-secondary/40 p-4">
            <p className="text-sm font-semibold">Új közösségi katalógus</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="kulcs (pl. kmo)" value={newDirectory.key}
                onChange={(e) => setNewDirectory({ ...newDirectory, key: e.target.value })} className="h-10" />
              <Input placeholder="Megnevezés" value={newDirectory.label}
                onChange={(e) => setNewDirectory({ ...newDirectory, label: e.target.value })} className="h-10" />
              <Input placeholder="https://… a Klubjaink oldal" value={newDirectory.listUrl}
                onChange={(e) => setNewDirectory({ ...newDirectory, listUrl: e.target.value })} className="h-10 sm:col-span-2" />
              <Input placeholder="Város" value={newDirectory.city}
                onChange={(e) => setNewDirectory({ ...newDirectory, city: e.target.value })} className="h-10" />
              <Input placeholder="Megjegyzés" value={newDirectory.note}
                onChange={(e) => setNewDirectory({ ...newDirectory, note: e.target.value })} className="h-10" />
            </div>
            <Button size="sm" onClick={() => void addDirectory()} disabled={saving}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Felveszem
            </Button>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">Klubok az ismétlődő programokból</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Egy programcím, ami hétről hétre ugyanott ismétlődik, valójában klub.
              Az így talált jelölteket elbírálásra teszi, nem élesíti magától.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void runDerive()} disabled={deriving}>
              {deriving ? 'Futtatás…' : 'Futtatás most'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
