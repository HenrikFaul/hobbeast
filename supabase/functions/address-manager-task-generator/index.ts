// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, jsonResponse, safeServe } from '../_address-manager-shared/edgeRuntime.ts';
import { loadLimits, releaseStaleLocks } from '../_address-manager-shared/repository.ts';

serve(safeServe(async (req) => {
  const supabaseAdmin = getSupabaseAdmin(req);
  const limits = await loadLimits(supabaseAdmin);

  await releaseStaleLocks(supabaseAdmin, 10);

  const { count: runningCount, error: runningError } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .select('id', { head: true, count: 'exact' })
    .eq('selected', true)
    .eq('status', 'running');
  if (runningError) throw runningError;

  if ((runningCount || 0) >= limits.max_parallel_workers) {
    return jsonResponse({
      ok: true,
      generated: false,
      reason: 'no_free_worker_slots',
      runningCount,
      maxParallelWorkers: limits.max_parallel_workers,
    });
  }

  const { data: nextCell, error } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .select('*')
    .eq('selected', true)
    .in('status', ['pending', 'error'])
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!nextCell) return jsonResponse({ ok: true, generated: false, reason: 'done' });

  const task = {
    matrix_id: nextCell.id,
    provider: nextCell.provider,
    country_code: nextCell.country_code,
    category_key: nextCell.category_key,
    cursor: nextCell.cursor || {},
    limits,
    generated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .update({
      status: 'running',
      last_error: null,
      last_run_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', nextCell.id);
  if (updateError) throw updateError;

  return jsonResponse({ ok: true, generated: true, task });
}));
