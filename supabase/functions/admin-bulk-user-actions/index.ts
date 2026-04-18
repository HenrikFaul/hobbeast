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

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function listAllAuthUsers(adminClient: ReturnType<typeof createClient>) {
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

async function ensureAdmin(req: Request, supabaseUrl: string, adminClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await (adminClient as any).rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error || !isAdmin) return null;
  return user;
}

async function previewSelection(adminClient: ReturnType<typeof createClient>, filters: Filters) {
  const { data: profiles, error } = await adminClient
    .from('profiles')
    .select('id,user_id,user_origin,is_active,created_at');
  if (error) throw error;

  const authUsers = await listAllAuthUsers(adminClient);
  const authMap = new Map(authUsers.map((user) => [user.id, user]));

  let filtered = [...(profiles || [])].filter((profile: any) => Boolean(profile.user_id));

  if (filters.userType && filters.userType !== 'all') {
    filtered = filtered.filter((profile: any) => (profile.user_origin || 'real') === filters.userType);
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
    const ownerIds = filtered.map((profile: any) => profile.user_id).filter(Boolean);
    if (ownerIds.length > 0) {
      const ownerIdCsv = ownerIds.join(',');
      const { data: events, error: eventsError } = await adminClient
        .from('events')
        .select('id,created_by,organizer_id,is_active')
        .or(`created_by.in.(${ownerIdCsv}),organizer_id.in.(${ownerIdCsv})`);
      if (eventsError) throw eventsError;
      const openOwnerIds = new Set((events || [])
        .filter((event: any) => event.is_active !== false)
        .flatMap((event: any) => [event.created_by, event.organizer_id])
        .filter(Boolean));
      filtered = filtered.filter((profile: any) =>
        filters.hasOpenOwnedEvents === 'yes'
          ? openOwnerIds.has(profile.user_id)
          : !openOwnerIds.has(profile.user_id)
      );
    }
  }

  const selectedUserIds = filtered.map((profile: any) => profile.user_id).filter(Boolean);
  const selectedProfileIds = filtered.map((profile: any) => profile.id).filter(Boolean);
  return { selectedUserIds, selectedProfileIds, selectedCount: selectedUserIds.length };
}

async function resolveProfilesByIds(adminClient: ReturnType<typeof createClient>, profileIds: string[]) {
  if (!profileIds.length) return [];
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,user_id')
    .in('id', profileIds);
  if (error) throw error;
  return (data || []).filter((row: any) => Boolean(row.user_id));
}

async function resolveProfilesByUserIds(adminClient: ReturnType<typeof createClient>, userIds: string[]) {
  if (!userIds.length) return [];
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,user_id')
    .in('user_id', userIds);
  if (error) throw error;
  return (data || []).filter((row: any) => Boolean(row.user_id));
}

async function applyAction(adminClient: ReturnType<typeof createClient>, action: Action, ids: { profileIds?: string[]; userIds?: string[] }) {
  const byProfile = await resolveProfilesByIds(adminClient, ids.profileIds || []);
  const byUser = await resolveProfilesByUserIds(adminClient, ids.userIds || []);
  const profileMap = new Map<string, any>();
  [...byProfile, ...byUser].forEach((row: any) => {
    if (row.user_id) profileMap.set(row.user_id, row);
  });
  const profiles = [...profileMap.values()];
  const userIds = profiles.map((profile: any) => profile.user_id);
  let affected = 0;
  let failures = 0;

  if (action === 'activate' || action === 'deactivate') {
    if (!userIds.length) return { affected: 0, failures: 0 };
    const { error } = await (adminClient as any).from('profiles').update({ is_active: action === 'activate' }).in('user_id', userIds);
    if (error) throw error;
    affected = userIds.length;
    return { affected, failures };
  }

  for (const profile of profiles) {
    try {
      const userId = profile.user_id;
      const { data: authUserData } = await adminClient.auth.admin.getUserById(userId);
      await (adminClient as any).from('account_deletions').insert({
        user_id: userId,
        email: authUserData.user?.email || `${userId}@unknown.local`,
        account_created_at: authUserData.user?.created_at || null,
        deletion_reason: 'admin_batch_delete',
      });
      await adminClient.from('event_participants').delete().eq('user_id', userId);
      const { data: ownEvents } = await adminClient.from('events').select('id').or(`created_by.eq.${userId},organizer_id.eq.${userId}`);
      const eventIds = (ownEvents || []).map((event: any) => event.id);
      if (eventIds.length > 0) {
        await adminClient.from('event_participants').delete().in('event_id', eventIds);
        await adminClient.from('events').delete().in('id', eventIds);
      }
      await adminClient.from('notification_preferences').delete().eq('user_id', userId);
      await adminClient.from('notifications').delete().eq('user_id', userId);
      await adminClient.from('profiles').delete().eq('user_id', userId);
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

    const { mode, filters, action, profileIds, userIds } = await req.json() as { mode: Mode; filters?: Filters; action?: Action; profileIds?: string[]; userIds?: string[] };

    if (mode === 'preview') {
      const rows = await previewSelection(adminClient, filters || {});
      return new Response(JSON.stringify(rows), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'apply') {
      if (!action || (!(profileIds?.length) && !(userIds?.length))) {
        return new Response(JSON.stringify({ error: 'Action and userIds are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await applyAction(adminClient, action, { profileIds, userIds });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unsupported mode' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
