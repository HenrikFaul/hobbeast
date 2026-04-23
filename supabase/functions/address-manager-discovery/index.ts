// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import { ensureMatrixSeeds, getMatrix, loadLimits, saveLimits, setSelections } from '../address-manager-shared/repository.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = getSupabaseAdmin(req);
  const body = await req.json().catch(() => ({})) as any;
  const action = String(body.action || 'get_state');

  try {
    await ensureMatrixSeeds(supabaseAdmin);

    if (action === 'save_limits') {
      const limits = await saveLimits(supabaseAdmin, body.limits || {});
      return json({ ok: true, limits, matrix: await getMatrix(supabaseAdmin) });
    }

    if (action === 'save_selection') {
      await setSelections(supabaseAdmin, Array.isArray(body.updates) ? body.updates : []);
      return json({ ok: true, limits: await loadLimits(supabaseAdmin), matrix: await getMatrix(supabaseAdmin) });
    }

    if (action === 'get_catalog') {
      const provider = body.provider ? String(body.provider) : null;
      const countries = Array.isArray(body.countries) ? body.countries.map((value: unknown) => String(value).toUpperCase()).filter(Boolean) : [];
      const categories = Array.isArray(body.categories) ? body.categories.map((value: unknown) => String(value)).filter(Boolean) : [];
      const search = String(body.search || '').trim();
      const page = parsePositiveInt(body.page, 1);
      const pageSize = Math.min(200, parsePositiveInt(body.pageSize, 25));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('raw_venues')
        .select(
          'id,provider,provider_venue_id,country_code,category_key,name,address,city,district,postal_code,latitude,longitude,phone,website,open_now,rating,review_count,discovered_at,updated_at',
          { count: 'exact' },
        )
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (provider) query = query.eq('provider', provider);
      if (countries.length > 0) query = query.in('country_code', countries);
      if (categories.length > 0) query = query.in('category_key', categories);
      if (search) {
        const escaped = search.replace(/,/g, ' ');
        query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%,city.ilike.%${escaped}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return json({
        ok: true,
        items: data || [],
        total: Number(count || 0),
        page,
        pageSize,
      });
    }

    return json({ ok: true, limits: await loadLimits(supabaseAdmin), matrix: await getMatrix(supabaseAdmin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
