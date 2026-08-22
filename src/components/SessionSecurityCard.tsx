import { useCallback, useEffect, useMemo, useState } from 'react';
import { Laptop, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getSessionDeviceDescriptor } from '@/features/identity/sessionDevice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SessionDevice {
  id: string;
  session_fingerprint: string;
  device_label: string;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

interface AccountActivity {
  id: string;
  event_type: string;
  device_label: string | null;
  created_at: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  sign_in: 'Bejelentkezés',
  sign_out: 'Kijelentkezés',
  password_reset: 'Jelszó-visszaállítás',
  session_seen: 'Aktív eszköz',
  sessions_revoked: 'Többi munkamenet visszavonva',
  new_device: 'Új eszköz',
  profile_privacy_changed: 'Adatvédelmi beállítás módosult',
};

export function SessionSecurityCard() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<SessionDevice[]>([]);
  const [activity, setActivity] = useState<AccountActivity[]>([]);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const descriptor = useMemo(() => getSessionDeviceDescriptor(window.localStorage, window.navigator.userAgent), []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    const [devicesResult, activityResult] = await Promise.all([
      supabase.from('user_session_devices').select('id,session_fingerprint,device_label,first_seen_at,last_seen_at,revoked_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.from('account_activity_events').select('id,event_type,device_label,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
    ]);
    if (devicesResult.error || activityResult.error) setLoadError(true);
    else {
      setDevices(devicesResult.data || []);
      setActivity(activityResult.data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOthers = async () => {
    setWorking(true);
    const { error: authError } = await supabase.auth.signOut({ scope: 'others' });
    if (authError) {
      toast.error('A többi Auth munkamenet nem vonható vissza.');
      setWorking(false);
      return;
    }
    const { data: count, error } = await supabase.rpc('mark_other_session_devices_revoked', {
      _current_fingerprint: descriptor.fingerprint,
    });
    if (error) toast.warning('Az Auth munkamenetek visszavonódtak, de az eszközlista naplózása nem frissült.');
    else toast.success(`${count} másik eszköz munkamenetét visszavontuk.`);
    await load();
    setWorking(false);
  };

  return (
    <Card className="rounded-2xl shadow-card">
      <CardHeader><CardTitle className="flex items-center gap-2.5 font-display"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><ShieldCheck className="h-5 w-5 text-primary" /></span>Fiókbiztonság</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Fiókaktivitás betöltése…</div>}
        {loadError && <div className="space-y-2" role="alert"><p className="text-sm text-destructive">A munkamenetlista most nem tölthető be.</p><Button type="button" variant="outline" onClick={() => void load()}>Újrapróbálom</Button></div>}
        {!loading && !loadError && <>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Eszközaktivitás</h3>
          {devices.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs rögzített eszköz.</p> : devices.map((device) => (
            <div key={device.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 font-medium"><Laptop className="h-4 w-4" />{device.device_label}</span>{device.session_fingerprint === descriptor.fingerprint && <Badge>Ez az eszköz</Badge>}{device.revoked_at && <Badge variant="secondary">Visszavonva</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">Utolsó aktivitás: {new Date(device.last_seen_at).toLocaleString('hu-HU')}</p>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full rounded-xl" disabled={working || devices.filter((device) => !device.revoked_at && device.session_fingerprint !== descriptor.fingerprint).length === 0} onClick={() => void revokeOthers()}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}Kijelentkezés minden más eszközről</Button>
          <p className="text-xs text-muted-foreground">A művelet a Supabase Auth többi munkamenetét is visszavonja; az aktuális eszköz bejelentkezve marad.</p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Legutóbbi fiókaktivitás</h3>
          {activity.length === 0 ? <p className="text-sm text-muted-foreground">Nincs megjeleníthető aktivitás.</p> : activity.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs"><span>{ACTIVITY_LABELS[item.event_type] || item.event_type}{item.device_label ? ` · ${item.device_label}` : ''}</span><time className="whitespace-nowrap text-muted-foreground">{new Date(item.created_at).toLocaleString('hu-HU')}</time></div>)}
        </div>
        </>}
      </CardContent>
    </Card>
  );
}
