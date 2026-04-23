// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin } from '../shared/providerFetch.ts';
import { loadLimits } from '../address-manager-shared/repository.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseAdmin = getSupabaseAdmin(req);

  try {
    const limits = await loadLimits(supabaseAdmin);

    const { data: activeWorkers } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('id')
      .eq('status', 'running');

    const runningCount = Array.isArray(activeWorkers) ? activeWorkers.length : 0;
    if (runningCount >= limits.max_parallel_workers) {
      return json({ ok: true, generated: false, reason: 'no_free_worker_slots', runningCount, maxParallelWorkers: limits.max_parallel_workers });
    }

    const { data: nextCell, error } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('*')
      .eq('selected', true)
      .in('status', ['pending', 'running'])
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!nextCell) {
      return json({ ok: true, generated: false, reason: 'done' });
    }

    const task = {
      matrix_id: nextCell.id,
      provider: nextCell.provider,
      country_code: nextCell.country_code,
      category_key: nextCell.category_key,
      cursor: nextCell.cursor || {},
      limits,
      generated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({ status: 'running', last_run_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', nextCell.id);

    return json({ ok: true, generated: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
