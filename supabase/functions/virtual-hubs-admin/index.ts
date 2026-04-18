// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSupabaseAdmin(req?: Request) {
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.');

  let supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  if (req) {
    const origin = new URL(req.url).origin;
    if (/\.supabase\.co$/i.test(new URL(origin).hostname)) supabaseUrl = origin;
  }
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL in Edge Function environment.');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseAdmin(req);

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || 'list';

    if (action === 'list') {
      const { data, error } = await supabase
        .from('virtual_hubs')
        .select('id, hobby_category, city, member_count, created_at')
        .order('member_count', { ascending: false });
      if (error) throw error;
      return jsonResponse({ hubs: data || [] });
    }

    if (action === 'user_hub_map') {
      const { data, error } = await supabase
        .from('virtual_hub_members')
        .select('user_id, hub_id, virtual_hubs(hobby_category, city)');
      if (error) throw error;

      const userHubMap: Record<string, Array<{ hub_id: string; hobby_category: string; city: string | null }>> = {};
      for (const row of (data || []) as any[]) {
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
        supabase.from('virtual_hub_members').select('user_id').eq('hub_id', hubId),
      ]);

      if (hubResult.error) throw hubResult.error;
      if (membersResult.error) throw membersResult.error;

      const userIds = (membersResult.data || []).map((r: any) => r.user_id).filter(Boolean);

      let profileRows: any[] = [];
      if (userIds.length > 0) {
        const { data: pData, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, display_name, city, hobbies, avatar_url')
          .in('user_id', userIds);
        if (pErr) throw pErr;
        profileRows = pData || [];
      }

      const profileMap = Object.fromEntries(profileRows.map((p: any) => [p.user_id, p]));
      const profiles = userIds.map((uid: string) => ({
        user_id: uid,
        display_name: profileMap[uid]?.display_name ?? null,
        city: profileMap[uid]?.city ?? null,
        hobbies: profileMap[uid]?.hobbies ?? [],
        avatar_url: profileMap[uid]?.avatar_url ?? null,
      }));

      return jsonResponse({ hub: hubResult.data, profiles });
    }

    if (action === 'update_hub') {
      const hubId: string = body.hub_id;
      const hobbyCategory: string = body.hobby_category;
      const city: string | null = body.city ?? null;
      if (!hubId || !hobbyCategory) return jsonResponse({ error: 'hub_id and hobby_category required' }, 400);

      const { error: updateError } = await supabase
        .from('virtual_hubs')
        .update({ hobby_category: hobbyCategory, city, updated_at: new Date().toISOString() })
        .eq('id', hubId);
      if (updateError) throw updateError;

      const { count } = await supabase
        .from('virtual_hub_members')
        .select('id', { count: 'exact', head: true })
        .eq('hub_id', hubId);

      const { error: countError } = await supabase
        .from('virtual_hubs')
        .update({ member_count: count || 0 })
        .eq('id', hubId);
      if (countError) throw countError;

      return jsonResponse({ ok: true, member_count: count || 0 });
    }

    if (action === 'refresh') {
      const { error } = await supabase.rpc('refresh_virtual_hubs' as any);
      if (error) throw error;

      const [hubsResult, membersResult] = await Promise.all([
        supabase.from('virtual_hubs').select('id', { count: 'exact', head: true }),
        supabase.from('virtual_hub_members').select('id', { count: 'exact', head: true }),
      ]);

      return jsonResponse({
        ok: true,
        created: hubsResult.count || 0,
        members: membersResult.count || 0,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('virtual-hubs-admin error', err);
    return jsonResponse({ error: message }, 500);
  }
});
