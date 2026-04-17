import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          console.error('[useAdmin] has_role failed', error);
          setIsAdmin(false);
        } else {
          console.info('[useAdmin] has_role resolved', { userId: user.id, isAdmin: Boolean(data) });
          setIsAdmin(Boolean(data));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  return { isAdmin, loading };
}
