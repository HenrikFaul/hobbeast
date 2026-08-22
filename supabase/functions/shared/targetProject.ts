import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  resolveVerifiedExternalProjectConfig,
  resolveVerifiedInternalProjectUrl,
} from './projectContract.ts';

function getTargetProjectUrl() {
  const external = resolveVerifiedExternalProjectConfig({
    url: Deno.env.get('EXTERNAL_SUPABASE_URL'),
    serviceRoleKey: Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'),
    expectedRef: Deno.env.get('EXTERNAL_SUPABASE_EXPECTED_PROJECT_REF'),
  });
  return external?.url || resolveVerifiedInternalProjectUrl({ envUrl: Deno.env.get('SUPABASE_URL') });
}

function getTargetServiceRoleKey() {
  const external = resolveVerifiedExternalProjectConfig({
    url: Deno.env.get('EXTERNAL_SUPABASE_URL'),
    serviceRoleKey: Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'),
    expectedRef: Deno.env.get('EXTERNAL_SUPABASE_EXPECTED_PROJECT_REF'),
  });
  const externalKey = external?.serviceRoleKey || '';
  const internalKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const targetKey = externalKey || internalKey;
  if (!targetKey) throw new Error('Missing target project service role key for admin operations.');
  return targetKey;
}

export function getTargetProjectAdmin() {
  const url = getTargetProjectUrl();
  const key = getTargetServiceRoleKey();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getExternalProjectAdmin() {
  const external = resolveVerifiedExternalProjectConfig({
    url: Deno.env.get('EXTERNAL_SUPABASE_URL'),
    serviceRoleKey: Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'),
    expectedRef: Deno.env.get('EXTERNAL_SUPABASE_EXPECTED_PROJECT_REF'),
  });
  if (!external) throw new Error('External Supabase project configuration is required.');
  return createClient(external.url, external.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireTargetProjectAdmin(req: Request, targetClient = getTargetProjectAdmin()) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) throw new Error('Missing authorization token.');

  const localUrl = resolveVerifiedInternalProjectUrl({ envUrl: Deno.env.get('SUPABASE_URL'), requestUrl: req.url });
  const localServiceKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!localUrl || !localServiceKey) throw new Error('Missing local Supabase configuration.');

  const localAdmin = createClient(localUrl, localServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await localAdmin.auth.getUser(token);
  if (userError || !userData?.user) throw new Error(`Unauthorized: ${userError?.message || 'unknown user'}`);

  const { data: roleRow, error: roleError } = await localAdmin
    .from('user_roles')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleError) throw new Error(`Admin role check failed: ${roleError.message}`);
  if (!roleRow) throw new Error('Admin access required.');

  return userData.user;
}
