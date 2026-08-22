// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';
import {
  decorateVirtualHubsWithDemand,
  type VirtualHubProfileRow,
  type VirtualHubRow,
} from '../shared/virtualHubEngine.ts';

interface QueryErrorShape {
  code?: string;
  message?: string;
}

interface HubListRow extends VirtualHubRow {
  created_at: string;
}

interface MembershipRow {
  hub_id: string;
  user_id: string;
}

interface HubMemberRow {
  user_id: string;
}

interface HubMapRow extends MembershipRow {
  virtual_hubs?: { hobby_category?: string; city?: string | null } | null;
}

interface HubDetailProfile extends VirtualHubProfileRow {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

function toQueryError(error: unknown): QueryErrorShape {
  return typeof error === 'object' && error !== null ? error as QueryErrorShape : {};
}

function isMissingUserOriginColumn(error: unknown) {
  const shapedError = toQueryError(error);
  const message = String(shapedError.message || '');
  return shapedError.code === '42703'
    || shapedError.code === 'PGRST204'
    || (message.includes('user_origin') && /column|schema cache/i.test(message));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabaseAdmin(req);
    const currentAdmin = await requireAdminUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || 'list';

    if (action === 'list') {
      const { data: hubRows, error: hubError } = await supabase
        .from('virtual_hubs')
        .select('id, hobby_category, hobby_subcategory, hobby_activity, city, member_count, created_at')
        .order('member_count', { ascending: false });
      if (hubError) throw hubError;

      const hubs = (hubRows || []) as HubListRow[];
      if (hubs.length === 0) return jsonResponse({ hubs: [] });

      const hubIds = hubs.map((hub) => hub.id);
      const { data: memberships, error: membershipError } = await supabase
        .from('virtual_hub_members')
        .select('hub_id, user_id')
        .eq('membership_status', 'active')
        .in('hub_id', hubIds);
      if (membershipError) throw membershipError;

      const membershipRows = (memberships || []) as MembershipRow[];
      const userIds = [...new Set(membershipRows.map((row) => row.user_id).filter(Boolean))];
      let profiles: VirtualHubProfileRow[] = [];
      let originClassificationStatus: 'available' | 'missing_column' = 'available';
      if (userIds.length > 0) {
        const originResult = await supabase
          .from('profiles')
          .select('user_id, user_origin')
          .in('user_id', userIds);
        if (originResult.error && !isMissingUserOriginColumn(originResult.error)) throw originResult.error;

        if (originResult.error) {
          originClassificationStatus = 'missing_column';
          const fallbackResult = await supabase.from('profiles').select('user_id').in('user_id', userIds);
          if (fallbackResult.error) throw fallbackResult.error;
          profiles = ((fallbackResult.data || []) as Array<{ user_id: string }>).map(
            (profile) => ({ ...profile, user_origin: null }),
          );
        } else {
          profiles = (originResult.data || []) as VirtualHubProfileRow[];
        }
      }

      const minimumRealMembers = Math.max(1, Number(body.minimum_real_members) || 1);
      return jsonResponse({
        hubs: decorateVirtualHubsWithDemand(hubs, membershipRows, profiles, minimumRealMembers),
        origin_classification_status: originClassificationStatus,
      });
    }

    if (action === 'user_hub_map') {
      const { data, error } = await supabase
        .from('virtual_hub_members')
        .select('user_id, hub_id, virtual_hubs(hobby_category, city)')
        .eq('membership_status', 'active');
      if (error) throw error;

      const userHubMap: Record<string, Array<{ hub_id: string; hobby_category: string; city: string | null }>> = {};
      for (const row of (data || []) as HubMapRow[]) {
        if (!row.user_id) continue;
        if (!userHubMap[row.user_id]) userHubMap[row.user_id] = [];
        userHubMap[row.user_id].push({
          hub_id: row.hub_id,
          hobby_category: row.virtual_hubs?.hobby_category || '',
          city: row.virtual_hubs?.city || null,
        });
      }
      return jsonResponse({ userHubMap });
    }

    // NOTE: virtual_hub_members has no FK to profiles — two separate queries required.
    if (action === 'get_hub_detail') {
      const hubId: string = body.hub_id;
      if (!hubId) return jsonResponse({ error: 'hub_id required' }, 400);

      const [hubResult, membersResult] = await Promise.all([
        supabase.from('virtual_hubs').select('*').eq('id', hubId).maybeSingle(),
        supabase
          .from('virtual_hub_members')
          .select('user_id')
          .eq('hub_id', hubId)
          .eq('membership_status', 'active'),
      ]);

      if (hubResult.error) throw hubResult.error;
      if (membersResult.error) throw membersResult.error;

      const memberRows = (membersResult.data || []) as HubMemberRow[];
      const userIds = memberRows.map((row) => row.user_id).filter(Boolean);

      let profileRows: HubDetailProfile[] = [];
      if (userIds.length > 0) {
        const profileResult = await supabase
          .from('profiles')
          .select('user_id, display_name, city, hobbies, avatar_url, user_origin')
          .in('user_id', userIds);
        if (profileResult.error && !isMissingUserOriginColumn(profileResult.error)) throw profileResult.error;

        if (profileResult.error) {
          const fallbackResult = await supabase
            .from('profiles')
            .select('user_id, display_name, city, hobbies, avatar_url')
            .in('user_id', userIds);
          if (fallbackResult.error) throw fallbackResult.error;
          profileRows = ((fallbackResult.data || []) as HubDetailProfile[]).map(
            (profile) => ({ ...profile, user_origin: null }),
          );
        } else {
          profileRows = (profileResult.data || []) as HubDetailProfile[];
        }
      }

      const profileMap = Object.fromEntries(profileRows.map((profile) => [profile.user_id, profile]));
      const profiles = userIds.map((uid: string) => ({
        user_id: uid,
        display_name: profileMap[uid]?.display_name ?? null,
        city: profileMap[uid]?.city ?? null,
        hobbies: profileMap[uid]?.hobbies ?? [],
        avatar_url: profileMap[uid]?.avatar_url ?? null,
        user_origin: profileMap[uid]?.user_origin ?? null,
      }));

      const [hubWithDemand] = decorateVirtualHubsWithDemand(
        hubResult.data ? [hubResult.data] : [],
        memberRows.map((row) => ({ hub_id: hubId, user_id: row.user_id })),
        profileRows,
        Math.max(1, Number(body.minimum_real_members) || 1),
      );

      return jsonResponse({ hub: hubWithDemand || hubResult.data, profiles });
    }

    if (action === 'update_hub') {
      const hubId: string = body.hub_id;
      const hobbyCategory = typeof body.hobby_category === 'string' ? body.hobby_category.trim() : '';
      const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim() : null;
      if (!hubId || !hobbyCategory) return jsonResponse({ error: 'hub_id and hobby_category required' }, 400);
      if (hobbyCategory.length > 120 || (city?.length || 0) > 160) {
        return jsonResponse({ error: 'Hub hobby or city is too long.' }, 400);
      }

      const { data: currentHub, error: currentHubError } = await supabase
        .from('virtual_hubs')
        .select('purpose, welcome_message, community_rules, join_policy, lifecycle_state, is_discoverable, member_count')
        .eq('id', hubId)
        .single();
      if (currentHubError) throw currentHubError;

      const { data: updatedHub, error: updateError } = await supabase.rpc(
        'admin_update_virtual_hub_metadata',
        {
          _hub_id: hubId,
          _hobby_category: hobbyCategory,
          _city: city,
          _purpose: typeof body.purpose === 'string' ? body.purpose : currentHub.purpose,
          _welcome_message: typeof body.welcome_message === 'string'
            ? body.welcome_message
            : currentHub.welcome_message,
          _community_rules: typeof body.community_rules === 'string'
            ? body.community_rules
            : currentHub.community_rules,
          _join_policy: typeof body.join_policy === 'string' ? body.join_policy : currentHub.join_policy,
          _lifecycle_state: typeof body.lifecycle_state === 'string' ? body.lifecycle_state : currentHub.lifecycle_state,
          _is_discoverable: typeof body.is_discoverable === 'boolean'
            ? body.is_discoverable
            : currentHub.is_discoverable,
          _actor_id: currentAdmin.id,
          _reason: typeof body.reason === 'string' ? body.reason : 'Admin hub metadata update',
        },
      );
      if (updateError) throw updateError;

      console.info('[virtual-hubs-admin] hub metadata updated', {
        action,
        admin_user_id: currentAdmin.id,
        hub_id: hubId,
        membership_mutation: 'none',
      });

      return jsonResponse({
        ok: true,
        hub: updatedHub,
        member_count: currentHub.member_count || 0,
        reconciliation_status: 'not_requested',
      });
    }

    if (action === 'refresh') {
      const batchLimit = Math.max(1, Math.min(500, Number(body.limit) || 100));
      const idempotencyKey = typeof body.idempotency_key === 'string' && body.idempotency_key.trim().length >= 8
        ? body.idempotency_key.trim()
        : `admin:${currentAdmin.id}:${new Date().toISOString().slice(0, 13)}`;
      const { data, error } = await supabase.rpc('reconcile_virtual_hubs_batch', {
        _limit: batchLimit,
        _idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      console.info('[virtual-hubs-admin] scoped reconciliation requested', {
        action,
        admin_user_id: currentAdmin.id,
        idempotency_key: idempotencyKey,
        limit: batchLimit,
      });
      return jsonResponse({ ok: true, reconciliation: data });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const unauthorized = message === 'Missing authorization token.' || message.startsWith('Unauthorized request:');
    const forbidden = message === 'Admin access required.';
    const status = unauthorized ? 401 : forbidden ? 403 : 500;
    if (status >= 500) console.error('virtual-hubs-admin error', err);
    return jsonResponse({
      error: status >= 500 ? message : status === 401 ? 'Unauthorized.' : 'Admin access required.',
      code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'ADMIN_REQUIRED' : 'INTERNAL_ERROR',
    }, status);
  }
});
