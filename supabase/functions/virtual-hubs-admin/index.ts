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

  const admin: any = getTargetProjectAdmin();

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
        .limit(1000);

      if (error) {
        throw new Error(`Hub query failed: ${error.message}`);
      }

      return jsonResponse({ hubs: (data || []) as VirtualHubRow[] });
    }

    // Mapping: { [user_id]: [{ hub_id, hobby_category, city }] }
    if (action === 'user_hub_map') {
      const { data: members, error: mErr } = await admin
        .from('virtual_hub_members')
        .select('user_id, hub_id')
        .limit(50000);
      if (mErr) throw new Error(`Members load failed: ${mErr.message}`);

      const { data: hubs, error: hErr } = await admin
        .from('virtual_hubs')
        .select('id, hobby_category, city')
        .limit(5000);
      if (hErr) throw new Error(`Hubs load failed: ${hErr.message}`);

      const hubMap = new Map<string, { id: string; hobby_category: string; city: string | null }>();
      for (const h of hubs || []) hubMap.set(h.id, h);

      const userMap: Record<string, Array<{ hub_id: string; hobby_category: string; city: string | null }>> = {};
      for (const m of members || []) {
        const hub = hubMap.get(m.hub_id);
        if (!hub) continue;
        const list = userMap[m.user_id] || (userMap[m.user_id] = []);
        list.push({ hub_id: hub.id, hobby_category: hub.hobby_category, city: hub.city });
      }
      return jsonResponse({ userHubMap: userMap });
    }

    if (action === 'get_hub_detail') {
      const hubId = String(body.hub_id || '').trim();
      if (!hubId) return jsonResponse({ error: 'hub_id required' }, 400);

      const { data: hub, error: hubErr } = await admin
        .from('virtual_hubs')
        .select('id, hobby_category, hobby_subcategory, hobby_activity, city, member_count, created_at, updated_at')
        .eq('id', hubId)
        .maybeSingle();
      if (hubErr) throw new Error(`Hub fetch failed: ${hubErr.message}`);
      if (!hub) return jsonResponse({ error: 'hub not found' }, 404);

      const { data: members, error: mErr } = await admin
        .from('virtual_hub_members')
        .select('user_id, joined_at')
        .eq('hub_id', hubId);
      if (mErr) throw new Error(`Members fetch failed: ${mErr.message}`);

      const userIds = (members || []).map((m: any) => m.user_id);
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await admin
          .from('profiles')
          .select('user_id, display_name, city, hobbies, avatar_url')
          .in('user_id', userIds);
        if (pErr) throw new Error(`Profiles fetch failed: ${pErr.message}`);
        profiles = profs || [];
      }

      return jsonResponse({ hub, members, profiles });
    }

    if (action === 'update_hub') {
      const hubId = String(body.hub_id || '').trim();
      if (!hubId) return jsonResponse({ error: 'hub_id required' }, 400);
      const newCity: string | null = body.city ? String(body.city).trim() : null;
      const newHobby: string = String(body.hobby_category || '').trim();
      if (!newHobby) return jsonResponse({ error: 'hobby_category required' }, 400);

      // Update hub fields
      const { error: updErr } = await admin
        .from('virtual_hubs')
        .update({ hobby_category: newHobby, city: newCity, updated_at: new Date().toISOString() })
        .eq('id', hubId);
      if (updErr) throw new Error(`Hub update failed: ${updErr.message}`);

      // Recalculate members: anyone whose profile.hobbies contains newHobby and (city matches OR newCity is null)
      const { data: profiles, error: pErr } = await admin
        .from('profiles')
        .select('user_id, city, hobbies');
      if (pErr) throw new Error(`Profiles load failed: ${pErr.message}`);

      const matchingUserIds = new Set<string>();
      for (const p of profiles || []) {
        const hobbies = Array.isArray(p.hobbies) ? p.hobbies.map((h: any) => String(h).trim()) : [];
        if (!hobbies.includes(newHobby)) continue;
        const profileCity = (p.city || '').trim();
        if (newCity && profileCity.toLowerCase() !== newCity.toLowerCase()) continue;
        if (p.user_id) matchingUserIds.add(p.user_id);
      }

      // Replace members
      const { error: delErr } = await admin.from('virtual_hub_members').delete().eq('hub_id', hubId);
      if (delErr) throw new Error(`Members reset failed: ${delErr.message}`);

      if (matchingUserIds.size > 0) {
        const rows = Array.from(matchingUserIds).map((uid) => ({ hub_id: hubId, user_id: uid }));
        const { error: insErr } = await admin.from('virtual_hub_members').insert(rows);
        if (insErr) throw new Error(`Members insert failed: ${insErr.message}`);
      }

      const { error: countErr } = await admin
        .from('virtual_hubs')
        .update({ member_count: matchingUserIds.size, updated_at: new Date().toISOString() })
        .eq('id', hubId);
      if (countErr) throw new Error(`Member count update failed: ${countErr.message}`);

      return jsonResponse({ ok: true, member_count: matchingUserIds.size });
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
