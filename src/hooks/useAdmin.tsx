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
    (async () => {
      try {
        const { data, error } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
        if (!active) return;
        if (error) {
          console.error('has_role failed', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(Boolean(data));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  return { isAdmin, loading };
}
