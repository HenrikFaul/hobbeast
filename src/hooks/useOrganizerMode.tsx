import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface OrganizerModeContextValue {
  mode: 'community' | 'organizer';
  setMode: (mode: 'community' | 'organizer') => void;
  canUseOrganizerMode: boolean;
  ownedEventCount: number;
}

const OrganizerModeContext = createContext<OrganizerModeContextValue | undefined>(undefined);
const STORAGE_KEY = 'hobbeast-app-mode';

export function OrganizerModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<'community' | 'organizer'>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'organizer' ? 'organizer' : 'community';
  });
  const [ownedEventCount, setOwnedEventCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!user) {
      setOwnedEventCount(0);
      setModeState('community');
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    void supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .then(({ count, error }) => {
        if (!active) return;
        if (error) {
          console.error('owned events count failed', error);
          setOwnedEventCount(0);
          return;
        }
        setOwnedEventCount(count ?? 0);
        if ((count ?? 0) === 0 && mode === 'organizer') {
          setModeState('community');
          window.localStorage.setItem(STORAGE_KEY, 'community');
        }
      });

    return () => {
      active = false;
    };
  }, [user, mode]);

  const setMode = (nextMode: 'community' | 'organizer') => {
    if (nextMode === 'organizer' && ownedEventCount === 0) return;
    setModeState(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  const value = useMemo(() => ({ mode, setMode, canUseOrganizerMode: ownedEventCount > 0, ownedEventCount }), [mode, ownedEventCount]);
  return <OrganizerModeContext.Provider value={value}>{children}</OrganizerModeContext.Provider>;
}

export function useOrganizerMode() {
  const context = useContext(OrganizerModeContext);
  if (!context) throw new Error('useOrganizerMode must be used within OrganizerModeProvider');
  return context;
}
