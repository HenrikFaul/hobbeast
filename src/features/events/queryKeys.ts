export const eventQueryKeys = {
  all: ['events'] as const,
  lists: () => [...eventQueryKeys.all, 'list'] as const,
  list: (filters: Readonly<Record<string, unknown>>) => [...eventQueryKeys.lists(), filters] as const,
  detail: (eventId: string) => [...eventQueryKeys.all, 'detail', eventId] as const,
  participants: (eventId: string) => [...eventQueryKeys.detail(eventId), 'participants'] as const,
};
