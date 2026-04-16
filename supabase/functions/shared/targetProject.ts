import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

function normalizeUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getTargetProjectUrl() {
  const externalUrl = normalizeUrl(Deno.env.get('EXTERNAL_SUPABASE_URL'));
  const internalUrl = normalizeUrl(Deno.env.get('SUPABASE_URL'));
  const targetUrl = externalUrl || internalUrl;

  if (!targetUrl) {
    throw new Error('Missing target project URL for admin operations.');
  }

  return targetUrl;
}

function getTargetServiceRoleKey() {
  const externalKey = String(Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const internalKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const targetKey = externalKey || internalKey;

  if (!targetKey) {
    throw new Error('Missing target project service role key for admin operations.');
  }

  return targetKey;
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

export function getTargetProjectAdmin() {
  const url = getTargetProjectUrl();
  const key = getTargetServiceRoleKey();
  console.log(`[targetProject] Using URL: ${url.substring(0, 30)}...`);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Authenticate the user against the LOCAL (Lovable) Supabase project,
 * then check admin role on the TARGET (external) project.
 * This is necessary because JWT tokens are signed by the local project
 * but admin roles live on the target project.
 */
export async function requireTargetProjectAdmin(req: Request, targetClient = getTargetProjectAdmin()) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing authorization token.');
  }

  // Step 1: Validate the JWT against the LOCAL project (where the user is authenticated)
  const localUrl = normalizeUrl(Deno.env.get('SUPABASE_URL'));
  const localServiceKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  if (!localUrl || !localServiceKey) {
    throw new Error('Missing local Supabase configuration.');
  }

  const localAdmin = createClient(localUrl, localServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await localAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error(`Unauthorized request: ${userError?.message || 'unknown user'}`);
  }

  // Step 2: Check admin role on the LOCAL project (where roles are managed)
  const { data: roleRow, error: roleError } = await localAdmin
    .from('user_roles')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleError) {
    throw new Error(`Admin role check failed: ${roleError.message}`);
  }

  if (!roleRow) {
    throw new Error('Admin access required.');
  }

  return userData.user;
}
