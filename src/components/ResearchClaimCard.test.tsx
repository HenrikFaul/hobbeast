import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  save: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  user: { id: 'user-one' } as { id: string } | null,
  claim: {
    id: 'claim-one',
    locale: 'hu-HU',
    statement: 'A forrásból változtatás nélkül betöltött állítás.',
    sourceTitle: 'Közösségi kapcsolatok vizsgálata',
    sourceContainer: 'Példa folyóirat',
    authors: 'Minta Szerző és Másik Szerző',
    publicationYear: 2024,
    sourceUrl: 'https://example.org/primary-source',
    doi: null,
    isSaved: false,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: (...args: unknown[]) => mocks.toastInfo(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('@/features/research-claims', () => ({
  useRandomResearchClaim: () => ({ data: mocks.claim, isLoading: false }),
  setResearchClaimSaved: (...args: unknown[]) => mocks.save(...args),
}));

import ResearchClaimCard from './ResearchClaimCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mocks.user = { id: 'user-one' };
  mocks.claim.isSaved = false;
  mocks.navigate.mockReset();
  mocks.save.mockReset().mockResolvedValue(true);
  mocks.toastError.mockReset();
  mocks.toastInfo.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
});

function renderCard() {
  act(() => root.render(
    <QueryClientProvider client={queryClient}>
      <ResearchClaimCard placement="research_feature" />
    </QueryClientProvider>,
  ));
}

describe('ResearchClaimCard', () => {
  it('renders the exact claim and complete source attribution, then persists a heart/save', async () => {
    renderCard();

    expect(container.querySelector('blockquote')?.textContent).toBe(mocks.claim.statement);
    expect(container.textContent).toContain(mocks.claim.sourceTitle);
    expect(container.textContent).toContain(mocks.claim.sourceContainer);
    expect(container.textContent).toContain(`${mocks.claim.authors} · ${mocks.claim.publicationYear}`);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(mocks.claim.sourceUrl);

    const saveButton = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.save).toHaveBeenCalledWith('claim-one', true);
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Az idézetet elmentetted.');
  });

  it('clears a local saved override when the authenticated identity changes', async () => {
    renderCard();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');

    mocks.user = { id: 'user-two' };
    mocks.claim.isSaved = false;
    renderCard();
    await act(async () => Promise.resolve());

    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('sends an anonymous visitor to authentication instead of pretending to save', () => {
    mocks.user = null;
    renderCard();

    act(() => container.querySelector<HTMLButtonElement>('button')?.click());

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledWith('Az idézet mentéséhez jelentkezz be.');
    expect(mocks.navigate).toHaveBeenCalledWith('/auth');
  });
});
