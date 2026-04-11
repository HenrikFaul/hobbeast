import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

interface Prefs {
  friend_request: boolean;
  event_invite: boolean;
  favorite_category_event: boolean;
}

export function NotificationPreferencesCard() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>({ friend_request: true, event_invite: true, favorite_category_event: true });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('notification preferences fetch failed', error);
      }

      if (data) {
        setPrefs({
          friend_request: (data as any).friend_request ?? true,
          event_invite: (data as any).event_invite ?? true,
          favorite_category_event: (data as any).favorite_category_event ?? true,
        });
      }
      setLoaded(true);
    };
    void fetch();
  }, [user]);

  const update = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    setPrefs((prev) => ({ ...prev, [key]: value }));

    const { data: existing, error: existingError } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      toast.error('Hiba a mentés során.');
      return;
    }

    const query = existing?.id
      ? supabase.from('notification_preferences').update({ [key]: value } as any).eq('id', (existing as any).id)
      : supabase.from('notification_preferences').insert({ user_id: user.id, [key]: value } as any);

    const { error } = await query;
    if (error) toast.error('Hiba a mentés során.');
  };

  if (!loaded) return null;

  return (
    <Card className="rounded-2xl shadow-card border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          Értesítési beállítások
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Állítsd be, milyen értesítéseket szeretnél kapni.</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><Label className="text-sm">Barát jelölések</Label><Switch checked={prefs.friend_request} onCheckedChange={(v) => update('friend_request', v)} /></div>
          <div className="flex items-center justify-between"><Label className="text-sm">Esemény meghívások</Label><Switch checked={prefs.event_invite} onCheckedChange={(v) => update('event_invite', v)} /></div>
          <div className="flex items-center justify-between"><Label className="text-sm">Kedvenc kategória új esemény</Label><Switch checked={prefs.favorite_category_event} onCheckedChange={(v) => update('favorite_category_event', v)} /></div>
        </div>
      </CardContent>
    </Card>
  );
}
