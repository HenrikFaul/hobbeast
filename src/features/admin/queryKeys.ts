export const adminQueryKeys = {
  all: ['admin'] as const,
  operations: (state?: string) => [...adminQueryKeys.all, 'operations', state || 'all'] as const,
  users: (filters: Readonly<Record<string, unknown>>) => [...adminQueryKeys.all, 'users', filters] as const,
  moderation: (status?: string) => [...adminQueryKeys.all, 'moderation', status || 'open'] as const,
  hubs: () => [...adminQueryKeys.all, 'virtual-hubs'] as const,
};
