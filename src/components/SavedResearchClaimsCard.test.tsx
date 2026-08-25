import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  user: { id: 'user-one' } as { id: string } | null,
  savedByUser: {
    'user-one': true,
    'user-two': true,
  } as Record<string, boolean>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

import { SavedResearchClaimsCard } from './SavedResearchClaimsCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function rowFor(userId: string) {
  return {
    claim_id: `claim-${userId}`,
    resolved_locale: 'hu-HU',
    statement_text: `Mentett állítás ${userId}`,
    source_title: `Forrás ${userId}`,
    source_container: 'Tesztfolyóirat',
    authors_display: 'Minta Szerző',
    publication_year: 2024,
    source_url: `https://example.org/${userId}`,
    doi: null,
    saved_at: '2026-08-25T12:00:00.000Z',
    total_count: 1,
  };
}

async function flushQueries() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  document.documentElement.lang = 'hu-HU';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mocks.user = { id: 'user-one' };
  mocks.savedByUser = { 'user-one': true, 'user-two': true };
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    const userId = mocks.user?.id ?? 'anonymous';
    if (name === 'list_saved_community_research_claims') {
      return {
        data: mocks.savedByUser[userId] ? [rowFor(userId)] : [],
        error: null,
      };
    }
    if (name === 'set_community_research_claim_saved') {
      const claimUserId = String(args._claim_id).replace('claim-', '');
      mocks.savedByUser[claimUserId] = Boolean(args._saved);
      return { data: Boolean(args._saved), error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
});

function renderCard() {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <SavedResearchClaimsCard />
    </QueryClientProvider>,
  ));
}

describe('SavedResearchClaimsCard', () => {
  it('renders attribution and source, then removes an unsaved claim from the UI', async () => {
    renderCard();
    await flushQueries();

    expect(container.textContent).toContain('Mentett állítás user-one');
    expect(container.textContent).toContain('Minta Szerző · 2024');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.org/user-one');

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Mentett idézet eltávolítása"]',
    );
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });
    await flushQueries();

    expect(mocks.rpc).toHaveBeenCalledWith('set_community_research_claim_saved', {
      _claim_id: 'claim-user-one',
      _saved: false,
    });
    expect(container.textContent).not.toContain('Mentett állítás user-one');
    expect(container.textContent).toContain('Még nincs mentett idézeted.');
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Az idézetet eltávolítottad a mentéseid közül.',
    );
  });

  it('switches to a separate user-scoped cache when authentication changes', async () => {
    renderCard();
    await flushQueries();
    expect(container.textContent).toContain('Mentett állítás user-one');

    mocks.user = { id: 'user-two' };
    renderCard();
    await flushQueries();

    expect(container.textContent).not.toContain('Mentett állítás user-one');
    expect(container.textContent).toContain('Mentett állítás user-two');
    expect(queryClient.getQueryData(['saved-community-research-claims', 'user-one', 'hu-HU']))
      .toBeDefined();
    expect(queryClient.getQueryData(['saved-community-research-claims', 'user-two', 'hu-HU']))
      .toBeDefined();
  });
});
