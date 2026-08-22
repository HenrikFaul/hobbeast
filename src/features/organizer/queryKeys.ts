export const organizerQueryKeys = {
  all: ['organizer'] as const,
  events: (ownerId: string) => [...organizerQueryKeys.all, 'events', ownerId] as const,
  event: (eventId: string) => [...organizerQueryKeys.all, 'event', eventId] as const,
  participants: (eventId: string) => [...organizerQueryKeys.event(eventId), 'participants'] as const,
  analytics: (eventId: string) => [...organizerQueryKeys.event(eventId), 'analytics'] as const,
};
