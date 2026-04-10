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

async function ensureAdmin(req: Request, supabaseUrl: string, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error || !isAdmin) return null;
  return user;
}

async function previewSelection(adminClient: ReturnType<typeof createClient>, filters: Filters) {
  const { data: profiles, error } = await adminClient.from('profiles').select('id,user_id,user_origin,created_at');
  if (error) throw error;

  let selected = profiles || [];

  if (filters.userType && filters.userType !== 'all') {
    selected = selected.filter((profile: any) => (profile.user_origin || 'real') === filters.userType);
  }

  if (filters.registeredOlderThanDays && filters.registeredOlderThanDays > 0) {
    const threshold = daysAgo(filters.registeredOlderThanDays);
    selected = selected.filter((profile: any) => new Date(profile.created_at) <= threshold);
  }

  const authUsers = await listAllAuthUsers(adminClient);
  const authMap = new Map(authUsers.map((user) => [user.id, user]));

  if (filters.inactiveDays && filters.inactiveDays > 0) {
    const threshold = daysAgo(filters.inactiveDays);
    selected = selected.filter((profile: any) => {
      const authUser = authMap.get(profile.user_id);
      const lastSignIn = authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at) : null;
      return !lastSignIn || lastSignIn <= threshold;
    });
  }

  if (filters.hasOpenOwnedEvents && filters.hasOpenOwnedEvents !== 'all') {
    const selectedIds = selected.map((profile: any) => profile.user_id);
    if (selectedIds.length > 0) {
      const { data: events, error: eventsError } = await adminClient.from('events').select('created_by,is_active').in('created_by', selectedIds);
      if (eventsError) throw eventsError;
      const openOwners = new Set((events || []).filter((event: any) => event.is_active).map((event: any) => event.created_by));
      selected = selected.filter((profile: any) => filters.hasOpenOwnedEvents === 'yes' ? openOwners.has(profile.user_id) : !openOwners.has(profile.user_id));
    }
  }

  return selected.map((profile: any) => profile.user_id);
}

async function applyAction(adminClient: ReturnType<typeof createClient>, action: Action, userIds: string[]) {
  let affected = 0;
  let failures = 0;

  if (action === 'activate' || action === 'deactivate') {
    const { error } = await adminClient.from('profiles').update({ is_active: action === 'activate' }).in('user_id', userIds);
    if (error) throw error;
    affected = userIds.length;
    return { affected, failures };
  }

  for (const userId of userIds) {
    try {
      await adminClient.from('account_deletions').insert({
        user_id: userId,
        email: `${userId}@unknown.local`,
        account_created_at: null,
        deletion_reason: 'admin_batch_delete',
      });

      const { data: ownEvents } = await adminClient.from('events').select('id').eq('created_by', userId);
      const eventIds = (ownEvents || []).map((event: any) => event.id);
      if (eventIds.length > 0) {
        await adminClient.from('event_participants').delete().in('event_id', eventIds);
        await adminClient.from('events').delete().in('id', eventIds);
      }

      await adminClient.from('event_participants').delete().eq('user_id', userId);
      await adminClient.from('profiles').delete().eq('user_id', userId);
      await adminClient.auth.admin.deleteUser(userId);
      affected += 1;
    } catch (error) {
      console.error('admin bulk delete failed for user', userId, error);
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

    const { mode, filters, action, userIds } = await req.json() as { mode: Mode; filters?: Filters; action?: Action; userIds?: string[] };

    if (mode === 'preview') {
      const selectedUserIds = await previewSelection(adminClient, filters || {});
      return new Response(JSON.stringify({ selectedUserIds, selectedCount: selectedUserIds.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mode === 'apply') {
      if (!action || !userIds?.length) {
        return new Response(JSON.stringify({ error: 'Action and userIds are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await applyAction(adminClient, action, userIds);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unsupported mode' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
