import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getSessionDeviceDescriptor } from '@/features/identity/sessionDevice';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    const registerDevice = (userId: string) => {
      // A token refresh is not a new sign-in; registering the device again on
      // every tab focus would be a write per glance at the page.
      if (registeredFor.current === userId) return;
      registeredFor.current = userId;
      const descriptor = getSessionDeviceDescriptor(window.localStorage, window.navigator.userAgent);
      window.setTimeout(() => {
        void supabase.rpc('register_my_session_device', {
          _session_fingerprint: descriptor.fingerprint,
          _device_label: descriptor.deviceLabel,
          _user_agent_family: descriptor.userAgentFamily,
        });
      }, 0);
    };

    /**
     * Supabase re-checks the session whenever the tab regains focus, and every
     * check hands back a NEW session object for the same signed-in person.
     * Setting state from it unconditionally changed the identity of `user`,
     * which re-ran every `useEffect(..., [user])` in the app — so coming back
     * to the tab looked exactly like a full page reload.
     *
     * State is therefore only written when the person, or the token, actually
     * changed.
     */
    const applySession = (next: Session | null) => {
      setSession((current) => (current?.access_token === next?.access_token ? current : next));
      setUser((current) => {
        const nextUser = next?.user ?? null;
        if (current?.id === nextUser?.id) return current;
        return nextUser;
      });
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      applySession(nextSession);
      if (event === 'SIGNED_OUT') registeredFor.current = null;
      if (event === 'SIGNED_IN' && nextSession?.user) registerDevice(nextSession.user.id);
    });

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      applySession(initial);
      if (initial?.user) registerDevice(initial.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setLoading(false);
    await supabase.auth.signOut({ scope: 'local' });
  };

  // Without this the context value is a fresh object on every render of the
  // provider, which re-renders every consumer for no reason.
  const value = useMemo(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
