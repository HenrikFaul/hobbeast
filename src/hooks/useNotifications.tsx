import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { mergeRealtimeNotification, type NotificationRecord } from '@/lib/notificationPlatform';

export type Notification = NotificationRecord;

function normalizeNotification(row: Omit<Notification, 'data'> & { data: unknown }): Notification {
  const data = typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
    ? row.data as Record<string, unknown>
    : {};
  return { ...row, data };
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id,user_id,type,title,body,data,is_read,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('notifications fetch failed', error);
      setError('Az értesítéseket most nem sikerült frissíteni. A korábban betöltött lista megmaradt.');
    } else {
      const items = ((data || []) as unknown as Array<Omit<Notification, 'data'> & { data: unknown }>)
        .map(normalizeNotification);
      setNotifications(items);
      setError(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = normalizeNotification(
          payload.new as unknown as Omit<Notification, 'data'> & { data: unknown },
        );
        setNotifications((prev) => mergeRealtimeNotification(prev, newNotif));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setError(null);
      return true;
    }
    console.error('notification mark-as-read failed', error);
    setError('Az értesítés állapotát nem sikerült menteni.');
    return false;
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setError(null);
      return true;
    }
    console.error('notification mark-all-as-read failed', error);
    setError('Az értesítéseket nem sikerült olvasottnak jelölni.');
    return false;
  }, [user, notifications]);

  const unreadCount = notifications.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);
  return { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, refetch: fetchNotifications };
}
