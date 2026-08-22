export const notificationQueryKeys = {
  all: ['notifications'] as const,
  inbox: (userId: string) => [...notificationQueryKeys.all, 'inbox', userId] as const,
  preferences: (userId: string) => [...notificationQueryKeys.all, 'preferences', userId] as const,
};
