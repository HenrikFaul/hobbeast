import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  canAccessAdminControlPlane,
  isAdminCapability,
  type AdminCapability,
} from '@/lib/adminControlPlane';
import { buildReleaseLabel } from '@/lib/buildInfo';
import { buildTelemetryEvent, createCorrelationId } from '@/lib/observability';
import { useAuth } from './useAuth';

function recordCapabilityLoadFailure(reason: 'invalid_response' | 'unavailable') {
  console.error('[admin-capability-load]', buildTelemetryEvent('error', 'admin_capability_load_failed', {
    correlationId: createCorrelationId(),
    release: buildReleaseLabel(),
  }, { reason }));
}

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [capabilities, setCapabilities] = useState<AdminCapability[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
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
      setCapabilities([]);
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase.functions.invoke('admin-control-plane', { body: { action: 'capabilities' } })
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !Array.isArray(data?.capabilities) || !Array.isArray(data?.roles)) {
          recordCapabilityLoadFailure('invalid_response');
          setIsAdmin(false);
          setCapabilities([]);
          setRoles([]);
        } else {
          const allowedCapabilities = data.capabilities.filter(isAdminCapability);
          setCapabilities(allowedCapabilities);
          setRoles(data.roles.filter((role: unknown): role is string => typeof role === 'string'));
          setIsAdmin(canAccessAdminControlPlane(allowedCapabilities));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        recordCapabilityLoadFailure('unavailable');
        setIsAdmin(false);
        setCapabilities([]);
        setRoles([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const hasCapability = useCallback(
    (capability: AdminCapability) => capabilities.includes(capability),
    [capabilities],
  );

  return { isAdmin, capabilities, roles, hasCapability, loading: loading || authLoading };
}
