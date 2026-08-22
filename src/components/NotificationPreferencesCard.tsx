import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Clock3, Mail, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/lib/notificationPlatform';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushCapability,
  type PushCapability,
} from '@/lib/pushNotifications';

interface PreferenceResponse {
  ok?: boolean;
  preferences?: NotificationPreferences;
  error?: string;
  code?: string;
}

const categoryRows: Array<{ key: keyof NotificationPreferences; label: string; description: string }> = [
  { key: 'friend_request', label: 'Kapcsolódási kérések', description: 'Új ismeretségi vagy közös aktivitási meghívás.' },
  { key: 'event_invite', label: 'Eseménymeghívások', description: 'Személyes meghívások egy Hobbeast eseményre.' },
  { key: 'favorite_category_event', label: 'Kedvenc aktivitások', description: 'Új esemény a kifejezetten kedvencnek jelölt aktivitásaidból.' },
  { key: 'organizer_enabled', label: 'Szervezői üzenetek', description: 'Az eseményed hostjának közvetlen tájékoztatása.' },
  { key: 'community_enabled', label: 'Közösség és újrakapcsolódás', description: 'Circle-, közösségi és alacsony nyomású follow-up üzenetek.' },
  { key: 'recommendation_enabled', label: 'Ajánlások és hub-lehetőségek', description: 'Privacy-safe, érdeklődésalapú eseményjavaslatok.' },
  { key: 'transactional_enabled', label: 'Esemény-emlékeztetők', description: 'Közelgő esemény és részvételi állapot emlékeztetők.' },
  { key: 'marketing_enabled', label: 'Marketing', description: 'Opcionális termék- és kampányüzenetek. Alapból kikapcsolva.' },
];

function isPreferenceResponse(value: unknown): value is PreferenceResponse {
  return typeof value === 'object' && value !== null;
}

export function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushCapability, setPushCapability] = useState<PushCapability | 'checking'>('checking');
  const [pushWorking, setPushWorking] = useState(false);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke('notification-preferences', {
      body: { action: 'get' },
    });
    if (invokeError || !isPreferenceResponse(data) || !data.preferences) {
      console.error('notification preferences fetch failed', invokeError || data);
      setError('Az értesítési beállítások most nem tölthetők be. A biztonságos alapértékek láthatók.');
    } else {
      setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...data.preferences });
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPreferences();
    void getPushCapability().then(setPushCapability).catch(() => setPushCapability('unsupported'));
  }, [loadPreferences]);

  const setPush = async (enabled: boolean) => {
    if (pushWorking) return;
    setPushWorking(true);
    try {
      if (enabled) {
        await enablePushNotifications();
        setPushCapability('subscribed');
        setPrefs((current) => ({ ...current, push_enabled: true }));
        toast.success('A push eszköz regisztrációja elkészült.');
      } else {
        await disablePushNotifications();
        setPushCapability('available');
        setPrefs((current) => ({ ...current, push_enabled: false }));
        toast.success('A push eszközregisztrációt visszavontuk.');
      }
    } catch (pushError) {
      console.error('push registration failed', pushError);
      toast.error('A push nem aktiválható ezen az eszközön vagy a szerver még nincs konfigurálva.');
      void getPushCapability().then(setPushCapability).catch(() => setPushCapability('unsupported'));
    } finally {
      setPushWorking(false);
    }
  };

  const updatePreference = async <Key extends keyof NotificationPreferences>(
    key: Key,
    value: NotificationPreferences[Key],
  ) => {
    if (savingKey) return;
    const previous = prefs;
    setSavingKey(key);
    setPrefs((current) => ({ ...current, [key]: value }));
    const { data, error: invokeError } = await supabase.functions.invoke('notification-preferences', {
      body: { action: 'update', preferences: { [key]: value } },
    });
    if (invokeError || !isPreferenceResponse(data) || !data.preferences) {
      setPrefs(previous);
      toast.error('A beállítást nem sikerült menteni. Az előző érték visszaállt.');
      setError('Az utolsó módosítás nem mentődött el.');
    } else {
      setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...data.preferences });
      setError(null);
    }
    setSavingKey(null);
  };

  if (loading) {
    return (
      <Card className="rounded-2xl shadow-card border" aria-busy="true">
        <CardHeader><Skeleton className="h-8 w-56" /></CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl shadow-card border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </span>
          Értesítési központ
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Kategóriánként, csatornánként és napszak szerint szabályozhatod a kommunikációt.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void loadPreferences()}>
              <RefreshCw className="h-3.5 w-3.5" /> Újrapróbálom
            </Button>
          </div>
        )}

        <section aria-labelledby="notification-category-heading" className="space-y-3">
          <div>
            <h3 id="notification-category-heading" className="font-semibold">Milyen témákról?</h3>
            <p className="text-xs text-muted-foreground">A kritikus lemondás-, időpontváltozás-, waitlist- és biztonsági jelzések mindig megmaradnak az appban.</p>
          </div>
          <div className="divide-y rounded-xl border">
            {categoryRows.map((row) => {
              const id = `notification-pref-${row.key}`;
              return (
                <div key={row.key} className="flex min-h-14 items-center justify-between gap-4 p-3">
                  <Label htmlFor={id} className="cursor-pointer space-y-0.5">
                    <span className="block text-sm font-medium">{row.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{row.description}</span>
                  </Label>
                  <Switch
                    id={id}
                    checked={Boolean(prefs[row.key])}
                    disabled={savingKey !== null}
                    onCheckedChange={(value) => void updatePreference(row.key, value)}
                    aria-describedby={`${id}-status`}
                  />
                  <span id={`${id}-status`} className="sr-only">{savingKey === row.key ? 'Mentés folyamatban' : 'Mentve'}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="notification-channel-heading" className="space-y-3">
          <h3 id="notification-channel-heading" className="font-semibold">Csatornák</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ['in_app_enabled', 'Appon belül', Bell, 'Mindig rendelkezésre áll.'],
              ['email_enabled', 'E-mail', Mail, 'Csak konfigurált szolgáltató esetén.'],
              ['push_enabled', 'Push', Smartphone, 'Csak regisztrált eszköz és provider esetén.'],
            ] as const).map(([key, label, Icon, description]) => (
              <div key={key} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                <Label htmlFor={`notification-channel-${key}`} className="cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" /> {label}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{description}</span>
                </Label>
                <Switch
                  id={`notification-channel-${key}`}
                  checked={prefs[key]}
                  disabled={savingKey !== null || pushWorking || (key === 'push_enabled' && ['unsupported', 'denied', 'checking'].includes(pushCapability))}
                  onCheckedChange={(value) => key === 'push_enabled' ? void setPush(value) : void updatePreference(key, value)}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3 text-xs">
            <span>Push eszközállapot: <strong>{pushCapability === 'subscribed' ? 'regisztrálva' : pushCapability === 'available' ? 'elérhető' : pushCapability === 'denied' ? 'böngészőben tiltva' : pushCapability === 'unsupported' ? 'nem támogatott' : 'ellenőrzés'}</strong></span>
            <Button type="button" size="sm" variant={pushCapability === 'subscribed' ? 'outline' : 'default'}
              disabled={pushWorking || ['unsupported', 'denied', 'checking'].includes(pushCapability)}
              onClick={() => void setPush(pushCapability !== 'subscribed')}>
              {pushCapability === 'subscribed' ? 'Push kikapcsolása' : 'Push engedélyezése ezen az eszközön'}
            </Button>
          </div>
        </section>

        <section aria-labelledby="notification-timing-heading" className="space-y-4 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-4">
            <Label htmlFor="notification-quiet-hours" className="cursor-pointer">
              <span id="notification-timing-heading" className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 text-primary" /> Csendes időszak</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">A nem kritikus üzenetek a következő engedélyezett időpontra kerülnek.</span>
            </Label>
            <Switch
              id="notification-quiet-hours"
              checked={prefs.quiet_hours_enabled}
              disabled={savingKey !== null}
              onCheckedChange={(value) => void updatePreference('quiet_hours_enabled', value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notification-quiet-start">Kezdete</Label>
              <Input
                id="notification-quiet-start"
                type="time"
                value={prefs.quiet_start}
                disabled={!prefs.quiet_hours_enabled || savingKey !== null}
                onChange={(event) => void updatePreference('quiet_start', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-quiet-end">Vége</Label>
              <Input
                id="notification-quiet-end"
                type="time"
                value={prefs.quiet_end}
                disabled={!prefs.quiet_hours_enabled || savingKey !== null}
                onChange={(event) => void updatePreference('quiet_end', event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notification-digest">Közösségi összefoglaló</Label>
              <select
                id="notification-digest"
                value={prefs.digest_mode}
                disabled={savingKey !== null}
                onChange={(event) => void updatePreference('digest_mode', event.target.value as NotificationPreferences['digest_mode'])}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="off">Azonnal</option>
                <option value="daily">Napi összefoglaló</option>
                <option value="weekly">Heti összefoglaló</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-frequency-cap">Nem kritikus napi maximum</Label>
              <Input
                id="notification-frequency-cap"
                type="number"
                min={1}
                max={100}
                value={prefs.frequency_cap_per_day}
                disabled={savingKey !== null}
                onChange={(event) => void updatePreference('frequency_cap_per_day', Number(event.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Időzóna: {prefs.timezone}</p>
        </section>

        <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>A beállítások nem írják felül a block/mute szabályokat. Generált tesztfelhasználóknak production kézbesítés nem indul.</p>
        </div>
      </CardContent>
    </Card>
  );
}
