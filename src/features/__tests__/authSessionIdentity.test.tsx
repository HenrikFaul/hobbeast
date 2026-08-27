import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

/**
 * Coming back to the tab must not look like a page reload.
 *
 * Supabase re-checks the session whenever the tab regains focus and hands back
 * a NEW session object for the same signed-in person. The provider used to
 * write that straight into state, which changed the identity of `user` and
 * re-ran every `useEffect(..., [user])` in the app — every list refetched,
 * every page appeared to reload.
 */

type Handler = (event: string, session: unknown) => void;
let handler: Handler | null = null;
const rpcMock = vi.fn();

const SESSION_A = {
  access_token: 'token-1',
  refresh_token: 'r1',
  user: { id: 'user-1', email: 'a@b.hu' },
};
/** Same person, same token — what a focus re-check returns. */
const SESSION_A_AGAIN = {
  access_token: 'token-1',
  refresh_token: 'r1',
  user: { id: 'user-1', email: 'a@b.hu' },
};
const SESSION_B = {
  access_token: 'token-2',
  refresh_token: 'r2',
  user: { id: 'user-2', email: 'c@d.hu' },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (fn: Handler) => {
        handler = fn;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: SESSION_A } }),
      signOut: vi.fn(),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/features/identity/sessionDevice', () => ({
  getSessionDeviceDescriptor: () => ({
    fingerprint: 'fp', deviceLabel: 'test', userAgentFamily: 'test',
  }),
}));

import { AuthProvider, useAuth } from '@/hooks/useAuth';

function Probe({ onUser }: { onUser: (user: unknown) => void }) {
  const { user } = useAuth();
  // Exactly the shape every page uses: an effect keyed on `user`.
  onUser(user);
  return null;
}

beforeEach(() => {
  handler = null;
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe('AuthProvider session identity', () => {
  it('keeps the same user object when the session is re-checked', async () => {
    const seen: unknown[] = [];
    render(
      <AuthProvider>
        <Probe onUser={(user) => { if (user) seen.push(user); }} />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen[seen.length - 1];

    // The tab regains focus: Supabase re-issues the same session.
    handler?.('TOKEN_REFRESHED', SESSION_A_AGAIN);
    await waitFor(() => expect(seen[seen.length - 1]).toBe(first));

    // Identity is unchanged, so no [user] effect anywhere re-runs.
    expect(seen.every((entry) => entry === first)).toBe(true);
  });

  it('does still change when a different person signs in', async () => {
    const seen: unknown[] = [];
    render(
      <AuthProvider>
        <Probe onUser={(user) => { if (user) seen.push(user); }} />
      </AuthProvider>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen[seen.length - 1];

    handler?.('SIGNED_IN', SESSION_B);
    await waitFor(() => expect(seen[seen.length - 1]).not.toBe(first));
    expect((seen[seen.length - 1] as { id: string }).id).toBe('user-2');
  });

  it('registers the device once, not on every focus', async () => {
    render(<AuthProvider><Probe onUser={() => undefined} /></AuthProvider>);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    handler?.('SIGNED_IN', SESSION_A_AGAIN);
    handler?.('TOKEN_REFRESHED', SESSION_A_AGAIN);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
