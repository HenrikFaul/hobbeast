// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type UserType = 'all' | 'real' | 'generated';
type HasOpenOwnedEvents = 'all' | 'yes' | 'no';
type Filters = {
  userType?: UserType;
  registeredOlderThanDays?: number | null;
  inactiveDays?: number | null;
  hasOpenOwnedEvents?: HasOpenOwnedEvents;
};
type Mode = 'preview' | 'apply';
type Action = 'delete' | 'activate' | 'deactivate';
type AdminClient = any;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isMissingColumnError(error: any, columns: string[]) {
  const message = String(error?.message || error?.details || '');
  return columns.some((column) => message.includes(column));
}

function getUserOrigin(profile: any, authUser: any): Exclude<UserType, 'all'> {
  const metadata = authUser?.user_metadata || {};
  if (profile?.user_origin === 'generated' || metadata.user_origin === 'generated' || metadata.is_test_user === true) {
    return 'generated';
  }
  return 'real';
}

async function listAllAuthUsers(adminClient: AdminClient) {
  const users: any[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < 500) break;
    page += 1;
  }
  return users;
}

async function ensureAdmin(req: Request, supabaseUrl: string, adminClient: AdminClient) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await adminClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error || !isAdmin) return null;
  return user;
}

async function loadProfiles(adminClient: AdminClient) {
  const extendedResult = await adminClient
    .from('profiles')
    .select('id,user_id,user_origin,is_active,created_at');

  if (!extendedResult.error) return extendedResult.data || [];
  if (!isMissingColumnError(extendedResult.error, ['user_origin', 'is_active'])) throw extendedResult.error;

  const fallbackResult = await adminClient
    .from('profiles')
    .select('id,user_id,created_at');

  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data || [];
}

async function previewSelection(adminClient: AdminClient, filters: Filters) {
  const profiles = await loadProfiles(adminClient);

  const authUsers = await listAllAuthUsers(adminClient);
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  const selected = [...profiles].filter((profile: any) => Boolean(profile.user_id));

  let filtered = selected;

  if (filters.userType && filters.userType !== 'all') {
    filtered = filtered.filter((profile: any) => getUserOrigin(profile, authMap.get(profile.user_id)) === filters.userType);
  }

  if (filters.registeredOlderThanDays && filters.registeredOlderThanDays > 0) {
    const threshold = daysAgo(filters.registeredOlderThanDays);
    filtered = filtered.filter((profile: any) => new Date(profile.created_at) <= threshold);
  }

  if (filters.inactiveDays && filters.inactiveDays > 0) {
    const threshold = daysAgo(filters.inactiveDays);
    filtered = filtered.filter((profile: any) => {
      const authUser = authMap.get(profile.user_id);
      const lastSignIn = authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at) : null;
      return !lastSignIn || lastSignIn <= threshold;
    });
  }

  if (filters.hasOpenOwnedEvents && filters.hasOpenOwnedEvents !== 'all') {
    const ownerIds = filtered.map((profile: any) => profile.user_id);
    if (ownerIds.length > 0) {
      const { data: events, error: eventsError } = await adminClient
        .from('events')
        .select('id,created_by,is_active')
        .in('created_by', ownerIds);
      if (eventsError) throw eventsError;
      const openOwnerIds = new Set((events || []).filter((event: any) => event.is_active).map((event: any) => event.created_by));
      filtered = filtered.filter((profile: any) => filters.hasOpenOwnedEvents === 'yes' ? openOwnerIds.has(profile.user_id) : !openOwnerIds.has(profile.user_id));
    }
  }

  return filtered.map((profile: any) => ({ profileId: profile.id, userId: profile.user_id }));
}

async function resolveProfiles(adminClient: AdminClient, profileIds: string[]) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,user_id')
    .in('id', profileIds);
  if (error) throw error;
  return (data || []).filter((row: any) => Boolean(row.user_id));
}

async function syncAuthActiveState(adminClient: AdminClient, userId: string, isActive: boolean) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) throw error;

  const currentMetadata = data.user?.user_metadata || {};
  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      is_active: isActive,
    },
  });

  if (updateError) throw updateError;
}

async function applyAction(adminClient: AdminClient, action: Action, profileIds: string[]) {
  const profiles = await resolveProfiles(adminClient, profileIds);
  const userIds = profiles.map((profile: any) => profile.user_id);
  let affected = 0;
  let failures = 0;

  if (action === 'activate' || action === 'deactivate') {
    const isActive = action === 'activate';

    for (const userId of userIds) {
      try {
        await syncAuthActiveState(adminClient, userId, isActive);
        affected += 1;
      } catch (error) {
        console.error('admin bulk user status update failed', userId, error);
        failures += 1;
      }
    }

    const profileUpdateResult = await adminClient.from('profiles').update({ is_active: isActive }).in('id', profileIds);
    if (profileUpdateResult.error && !isMissingColumnError(profileUpdateResult.error, ['is_active'])) {
      throw profileUpdateResult.error;
    }

    return { affected, failures };
  }

  for (const profile of profiles) {
    try {
      const userId = profile.user_id;
      const { data: authUserData } = await adminClient.auth.admin.getUserById(userId);
      await adminClient.from('account_deletions').insert({
        user_id: userId,
        email: authUserData.user?.email || `${userId}@unknown.local`,
        account_created_at: authUserData.user?.created_at || null,
        deletion_reason: 'admin_batch_delete',
      });
      await adminClient.from('event_participants').delete().eq('user_id', userId);
      const { data: ownEvents } = await adminClient.from('events').select('id').eq('created_by', userId);
      const eventIds = (ownEvents || []).map((event: any) => event.id);
      if (eventIds.length > 0) {
        await adminClient.from('event_participants').delete().in('event_id', eventIds);
        await adminClient.from('events').delete().in('id', eventIds);
      }
      await adminClient.from('notification_preferences').delete().eq('user_id', userId);
      await adminClient.from('notifications').delete().eq('user_id', userId);
      await adminClient.from('profiles').delete().eq('id', profile.id);
      await adminClient.auth.admin.deleteUser(userId);
      affected += 1;
    } catch (error) {
      console.error('admin bulk action failed', profile.id, error);
      failures += 1;
    }
  }

  return { affected, failures };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const caller = await ensureAdmin(req, supabaseUrl, adminClient);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { mode, filters, action, profileIds } = await req.json() as { mode: Mode; filters?: Filters; action?: Action; profileIds?: string[] };

    if (mode === 'preview') {
      const rows = await previewSelection(adminClient, filters || {});
      return new Response(JSON.stringify({ selectedProfileIds: rows.map((row) => row.profileId), selectedCount: rows.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'apply') {
      if (!action || !profileIds?.length) {
        return new Response(JSON.stringify({ error: 'Action and profileIds are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await applyAction(adminClient, action, profileIds);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unsupported mode' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
