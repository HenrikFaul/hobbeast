import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  getNotificationMetadata,
  groupNotifications,
  resolveNotificationDeepLink,
  type NotificationRecord,
} from '@/lib/notificationPlatform';

export function NotificationBell() {
  const { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, refetch } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const groups = groupNotifications(notifications);

  useEffect(() => {
    const pointerHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', pointerHandler);
    document.addEventListener('keydown', keyboardHandler);
    return () => {
      document.removeEventListener('mousedown', pointerHandler);
      document.removeEventListener('keydown', keyboardHandler);
    };
  }, []);

  const openNotification = async (notification: NotificationRecord) => {
    if (!notification.is_read) await markAsRead(notification.id);
    const deepLink = resolveNotificationDeepLink(notification.type, notification.data);
    if (deepLink) {
      setOpen(false);
      navigate(deepLink);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-muted transition-colors"
        aria-label="Értesítések"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <Bell className="h-5 w-5 text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-labelledby="notification-panel-title"
          className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-popover shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 id="notification-panel-title" className="font-display font-semibold text-sm">Értesítések</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-8 gap-1" onClick={() => void markAllAsRead()}>
                <CheckCheck className="h-3.5 w-3.5" /> Mind olvasott
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto" aria-live="polite">
            {loading && notifications.length === 0 ? (
              <div className="space-y-3 p-4" role="status">
                <span className="sr-only">Értesítések betöltése</span>
                {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : error && notifications.length === 0 ? (
              <div className="space-y-3 px-5 py-8 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => void refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Újrapróbálom
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nincsenek értesítéseid
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.key} aria-labelledby={`notification-group-${group.key}`}>
                  <h4 id={`notification-group-${group.key}`} className="sticky top-0 bg-popover/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {group.label}
                  </h4>
                  {group.items.map((notification) => {
                    const deepLink = resolveNotificationDeepLink(notification.type, notification.data);
                    return (
                      <button
                        key={notification.id}
                        onClick={() => void openNotification(notification)}
                        className={cn(
                          'w-full min-h-11 text-left px-4 py-3 flex gap-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset transition-colors border-b last:border-0',
                          !notification.is_read && 'bg-primary/5',
                        )}
                        aria-label={`${notification.title}${deepLink ? ' – megnyitás' : ' – olvasottnak jelölés'}`}
                      >
                        <span aria-hidden="true" className="text-lg flex-shrink-0 mt-0.5">{getNotificationMetadata(notification.type).icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm', !notification.is_read && 'font-semibold')}>{notification.title}</p>
                          {notification.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: hu })}
                          </p>
                        </div>
                        {!notification.is_read && <span aria-label="Olvasatlan" className="flex-shrink-0 mt-1.5 h-2 w-2 rounded-full bg-primary" />}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
          {error && notifications.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <span>{error}</span>
              <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => void refetch()}>Újra</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
