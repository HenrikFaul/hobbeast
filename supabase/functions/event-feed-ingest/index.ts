import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { requireAdminUser } from '../shared/adminAuth.ts';
import { correlationIdFromRequest, logEdgeEvent } from '../shared/edgeObservability.ts';
import { getSupabaseAdmin, resolveInternalSupabaseUrl } from '../shared/providerFetch.ts';
import { resolveEventFeedHostAddresses } from './dnsResolver.ts';
import { createEventFeedHandler } from './handler.ts';
import { createEventFeedRepository } from './repository.ts';

function createUserClient(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const publishableKey = String(
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
  ).trim();
  if (!authorization.startsWith('Bearer ') || !publishableKey) {
    throw new Error('Missing authorization credentials.');
  }
  return createClient(resolveInternalSupabaseUrl(request), publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

Deno.serve(async (request) => {
  const admin = getSupabaseAdmin(request);
  const handler = createEventFeedHandler({
    requireAdminUser: (candidate) => requireAdminUser(candidate, admin),
    createUserClient,
    repository: createEventFeedRepository(admin),
    resolveHost: resolveEventFeedHostAddresses,
    cronSecret: () => String(Deno.env.get('EVENT_FEED_CRON_HMAC_SECRET') || '').trim(),
    correlationIdFromRequest,
    logEvent: logEdgeEvent,
  });
  return handler(request);
});
