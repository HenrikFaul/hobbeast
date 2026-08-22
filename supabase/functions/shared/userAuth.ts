import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { resolveInternalSupabaseUrl } from './providerFetch.ts';

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function requireAuthenticatedUserClient(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new Error('AUTH_REQUIRED');
  const publishableKey = String(
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
  ).trim();
  if (!publishableKey) throw new Error('EDGE_AUTH_CONFIGURATION_MISSING');

  const client = createClient(resolveInternalSupabaseUrl(req), publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_INVALID');
  return { client, user: data.user };
}

// Backward-compatible name used by the first production Edge contracts. Both
// helpers return the same verified caller context; new code may use the more
// explicit `requireAuthenticatedUserClient` name.
export const requireAuthenticatedUser = requireAuthenticatedUserClient;
