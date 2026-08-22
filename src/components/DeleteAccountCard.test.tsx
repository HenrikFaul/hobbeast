import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountCard } from './DeleteAccountCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  loadRequests: vi.fn(),
  requestAction: vi.fn(),
  prepareExport: vi.fn(),
  downloadExport: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => {
  const user = { id: 'user-1' };
  return { useAuth: () => ({ user }) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.order = () => mocks.loadRequests();
      return chain;
    },
    rpc: vi.fn(),
  },
}));

vi.mock('@/features/identity/privacyRuntimeRepository', () => ({
  buildDataRequestIdempotencyKey: () => 'request-key',
  DATA_EXPORT_SCOPES: [{ value: 'profile', label: 'Profil' }],
  downloadJsonExport: (...args: unknown[]) => mocks.downloadExport(...args),
  prepareMyDataExport: (...args: unknown[]) => mocks.prepareExport(...args),
  requestMyDataSubjectAction: (...args: unknown[]) => mocks.requestAction(...args),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.loadRequests.mockReset();
  mocks.requestAction.mockReset();
  mocks.prepareExport.mockReset();
  mocks.downloadExport.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderCard() {
  await act(async () => {
    root.render(<DeleteAccountCard />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DeleteAccountCard export availability', () => {
  it('offers a fresh request when the prepared export has expired', async () => {
    mocks.loadRequests.mockResolvedValue({
      data: [{
        id: 'export-1',
        request_type: 'export',
        status: 'ready',
        grace_period_ends_at: null,
        export_expires_at: '2020-01-01T00:00:00.000Z',
      }],
      error: null,
    });

    await renderCard();

    expect(document.body.textContent).toContain('Új export készítése');
    expect(document.body.textContent).not.toContain('JSON export letöltése');
  });

  it('does not expose a download action while an export is processing', async () => {
    mocks.loadRequests.mockResolvedValue({
      data: [{
        id: 'export-2',
        request_type: 'export',
        status: 'processing',
        grace_period_ends_at: null,
        export_expires_at: null,
      }],
      error: null,
    });

    await renderCard();

    expect(document.querySelector('[role="status"]')?.textContent).toContain('előkészítése');
    expect(document.body.textContent).not.toContain('JSON export letöltése');
  });
});
