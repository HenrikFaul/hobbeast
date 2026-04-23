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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = getSupabaseAdmin(req);
  const body = await req.json().catch(() => ({})) as any;
  const action = String(body.action || 'discover');

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

    return json({ ok: true, limits: await loadLimits(supabaseAdmin), matrix: await getMatrix(supabaseAdmin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
