import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { getSupabaseAdmin, resolveInternalSupabaseUrl } from './providerFetch.ts';

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

export async function requireAdminUser(req: Request, admin = getSupabaseAdmin(req)) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing authorization token.');
  }

  const supabaseUrl = resolveInternalSupabaseUrl(req);
  const publishableKey = String(
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
  ).trim();

  if (!publishableKey) {
    throw new Error('Missing publishable key in Edge Function environment.');
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Error(`Unauthorized request: ${userError?.message || 'unknown user'}`);
  }

  const { data: roleRow, error: roleError } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleError) {
    throw new Error(`Admin role check failed: ${roleError.message}`);
  }

  if (!roleRow) {
    throw new Error('Admin access required.');
  }

  return user;
}
