import { describe, expect, it, vi } from 'vitest';

import {
  createEventFeedHandler,
  type EventFeedHandlerDependencies,
} from '../../../supabase/functions/event-feed-ingest/handler';
import {
  createEventFeedRepository,
  EventFeedRepositoryError,
  type EventFeedRepository,
} from '../../../supabase/functions/event-feed-ingest/repository';

const ENDPOINT = 'https://example.test/functions/v1/event-feed-ingest';

function post(body: unknown) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer capability-operator-jwt' },
    body: JSON.stringify(body),
  });
}

function repository(overrides: Partial<EventFeedRepository> = {}) {
  return {
    processor: {
      storeRawPayload: vi.fn(),
      commitItem: vi.fn(),
      completeRun: vi.fn(),
    },
    requireProviderManager: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ summary: { total: 0 }, sources: [], runs: [] })),
    claimDue: vi.fn(async () => []),
    claimSource: vi.fn(),
    consumeCronDispatch: vi.fn(),
    reviewSource: vi.fn(),
    ...overrides,
  } as unknown as EventFeedRepository;
}

function dependencies(repositoryValue: EventFeedRepository) {
  return {
    requireAuthenticatedUser: vi.fn(async () => ({ id: 'capability-operator-1' })),
    createUserClient: vi.fn(() => ({ rpc: vi.fn() }) as never),
    repository: repositoryValue,
    processClaim: vi.fn(),
    resolveHost: vi.fn(async () => ['93.184.216.34']),
    cronSecret: vi.fn(() => ''),
    correlationIdFromRequest: vi.fn(() => 'capability-correlation'),
    logEvent: vi.fn(),
  } satisfies EventFeedHandlerDependencies;
}

describe('event feed providers.manage boundary', () => {
  it('rejects an authenticated operator without providers.manage before service-role reads', async () => {
    const repo = repository({
      requireProviderManager: vi.fn(async () => {
        throw new EventFeedRepositoryError('EVENT_FEED_CAPABILITY_CHECK_FAILED', 'capability_required');
      }),
    });
    const deps = dependencies(repo);

    const response = await createEventFeedHandler(deps)(post({
      action: 'status',
      query: 'Budapest Park',
      page: 10,
      limit: 20,
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'AUTHORIZATION_FAILED' });
    expect(deps.requireAuthenticatedUser).toHaveBeenCalledOnce();
    expect(repo.requireProviderManager).toHaveBeenCalledWith('capability-operator-1');
    expect(repo.status).not.toHaveBeenCalled();
  });

  it('allows a capability operator without a legacy admin-role dependency and forwards pagination', async () => {
    const repo = repository();
    const deps = dependencies(repo);

    const response = await createEventFeedHandler(deps)(post({
      action: 'status',
      query: 'Budapest Park',
      page: 10,
      limit: 20,
    }));

    expect(response.status).toBe(200);
    expect(repo.requireProviderManager).toHaveBeenCalledWith('capability-operator-1');
    expect(repo.status).toHaveBeenCalledWith({ query: 'Budapest Park', page: 10, limit: 20 });
    expect(vi.mocked(repo.requireProviderManager).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(repo.status).mock.invocationCallOrder[0]);
  });

  it('checks exactly providers.manage through the service client and fails closed', async () => {
    const grantedRpc = vi.fn(async () => ({ data: true, error: null }));
    const grantedRepository = createEventFeedRepository({ rpc: grantedRpc } as never);

    await expect(grantedRepository.requireProviderManager('capability-operator-1')).resolves.toBeUndefined();
    expect(grantedRpc).toHaveBeenCalledWith('admin_has_capability', {
      _user_id: 'capability-operator-1',
      _capability_key: 'providers.manage',
    });

    const deniedRepository = createEventFeedRepository({
      rpc: vi.fn(async () => ({ data: false, error: null })),
    } as never);
    await expect(deniedRepository.requireProviderManager('capability-operator-2')).rejects.toMatchObject({
      name: 'EventFeedRepositoryError',
      failure: 'capability_required',
    });
  });
});
