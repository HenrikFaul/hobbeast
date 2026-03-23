Notification system architecture and preferences

## Tables
- `notifications`: id, user_id, type, title, body, data (jsonb), is_read, created_at
  - Types: friend_request, event_invite, favorite_category_event
  - Realtime enabled
- `notification_preferences`: user_id (unique), friend_request, event_invite, favorite_category_event (all booleans)
- `profiles.favorite_event_categories`: text[] column for favorite hobby categories

## Components
- `src/hooks/useNotifications.tsx` - hook with realtime subscription
- `src/components/NotificationBell.tsx` - bell icon with red dot, dropdown
- `src/components/NotificationPreferencesCard.tsx` - toggle switches in profile
- `src/components/FavoriteEventCategoriesCard.tsx` - category picker in profile

## Integration Points
- Bell icon in Navbar (next to ProfileMenu, only for logged-in users)
- Preferences card in Profile sidebar
- Favorite categories card in Profile main column
