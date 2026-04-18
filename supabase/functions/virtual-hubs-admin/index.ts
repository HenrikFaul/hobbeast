import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { corsHeaders, jsonResponse } from '../shared/providerFetch.ts';
import { getTargetProjectAdmin, requireTargetProjectAdmin } from '../shared/targetProject.ts';

type VirtualHubRow = {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
  created_at: string;
};

function buildHubKey(hobby: string, city: string | null) {
  return `${hobby.trim().toLowerCase()}::${(city || '').trim().toLowerCase()}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = getTargetProjectAdmin();

  try {
    await requireTargetProjectAdmin(req, admin);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'list';

    if (action === 'list') {
      const { data, error } = await admin
        .from('virtual_hubs')
        .select('id, hobby_category, city, member_count, created_at')
        .order('member_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        throw new Error(`Hub query failed: ${error.message}`);
      }

      return jsonResponse({ hubs: (data || []) as VirtualHubRow[] });
    }

    if (action === 'refresh') {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('user_id, city, hobbies');

      if (profilesError) {
        throw new Error(`Profile load failed: ${profilesError.message}`);
      }

      const grouped = new Map<string, { hobby_category: string; city: string | null; members: Set<string> }>();

      for (const profile of profiles || []) {
        const userId = String(profile.user_id || '').trim();
        const hobbies = Array.isArray(profile.hobbies) ? profile.hobbies : [];
        const city = typeof profile.city === 'string' && profile.city.trim() ? profile.city.trim() : null;
        if (!userId || hobbies.length === 0) continue;

        for (const hobbyValue of hobbies) {
          const hobby = String(hobbyValue || '').trim();
          if (!hobby) continue;

          const key = buildHubKey(hobby, city);
          const existing = grouped.get(key) || { hobby_category: hobby, city, members: new Set<string>() };
          existing.members.add(userId);
          grouped.set(key, existing);
        }
      }

      const hubSeedRows = Array.from(grouped.values()).map((hub) => ({
        hobby_category: hub.hobby_category,
        city: hub.city,
        member_count: hub.members.size,
      }));

      const { error: deleteMembersError } = await admin.from('virtual_hub_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteMembersError) {
        throw new Error(`Hub members reset failed: ${deleteMembersError.message}`);
      }

      const { error: deleteHubsError } = await admin.from('virtual_hubs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteHubsError) {
        throw new Error(`Hub reset failed: ${deleteHubsError.message}`);
      }

      if (hubSeedRows.length === 0) {
        return jsonResponse({ ok: true, hubs: [], created: 0, members: 0 });
      }

      const { data: insertedHubs, error: insertHubsError } = await admin
        .from('virtual_hubs')
        .insert(hubSeedRows)
        .select('id, hobby_category, city, member_count, created_at');

      if (insertHubsError) {
        throw new Error(`Hub insert failed: ${insertHubsError.message}`);
      }

      const hubIdByKey = new Map<string, string>();
      for (const hub of insertedHubs || []) {
        hubIdByKey.set(buildHubKey(hub.hobby_category, hub.city), hub.id);
      }

      const membershipRows: Array<{ hub_id: string; user_id: string }> = [];
      for (const [key, hub] of grouped.entries()) {
        const hubId = hubIdByKey.get(key);
        if (!hubId) continue;

        for (const userId of hub.members) {
          membershipRows.push({ hub_id: hubId, user_id: userId });
        }
      }

      if (membershipRows.length > 0) {
        const { error: membershipError } = await admin.from('virtual_hub_members').insert(membershipRows);
        if (membershipError) {
          throw new Error(`Hub member insert failed: ${membershipError.message}`);
        }
      }

      return jsonResponse({
        ok: true,
        created: insertedHubs?.length || 0,
        members: membershipRows.length,
        hubs: (insertedHubs || []) as VirtualHubRow[],
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('virtual-hubs-admin error:', error);
    const status = /admin access required|unauthorized|missing authorization token/i.test(message) ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});