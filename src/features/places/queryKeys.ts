export const placeQueryKeys = {
  all: ['places'] as const,
  search: (query: string, provider: string, category?: string) => [
    ...placeQueryKeys.all,
    'search',
    query.trim().toLocaleLowerCase('hu-HU'),
    provider,
    category || null,
  ] as const,
  reverse: (lat: number, lon: number) => [...placeQueryKeys.all, 'reverse', lat, lon] as const,
};
