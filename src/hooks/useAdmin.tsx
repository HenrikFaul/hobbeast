import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to fully resolve before running the admin check.
    // Without this, React 18 batches the initial effects and creates a
    // window where authLoading=false + user=<user> + adminLoading=false
    // simultaneously, triggering a premature redirect.
    if (authLoading) return;

    let active = true;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' } as any)
      .then(({ data, error }: any) => {
        if (!active) return;
        if (error) {
          console.error('has_role failed', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(Boolean(data));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  return { isAdmin, loading: loading || authLoading };
}
