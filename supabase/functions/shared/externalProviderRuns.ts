import type { ProviderFetchError } from './providerFetch.ts';
import { getSupabaseAdmin } from './providerFetch.ts';

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export async function startExternalProviderRun(
  admin: AdminClient,
  provider: string,
  action: string,
  startedBy: string | null,
) {
  const { error: freshnessError } = await admin.rpc('refresh_external_supply_freshness');
  if (freshnessError) throw new Error(`PROVIDER_FRESHNESS_REFRESH_FAILED:${freshnessError.code || 'unknown'}`);
  const { data, error } = await admin.from('external_provider_sync_runs').insert({
    provider,
    action,
    status: 'running',
    started_by: startedBy,
  }).select('id').single();
  if (error) throw new Error(`PROVIDER_RUN_START_FAILED:${error.code || 'unknown'}`);
  return data.id as string;
}

export async function assertExternalProviderAvailable(admin: AdminClient, provider: string) {
  const { data, error } = await admin.from('external_provider_state')
    .select('enabled,circuit_state,circuit_open_until')
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(`PROVIDER_STATE_READ_FAILED:${error.code || 'unknown'}`);
  if (!data) return;
  if (data.enabled === false) throw new Error('PROVIDER_DISABLED');
  const openUntil = data.circuit_open_until ? Date.parse(data.circuit_open_until) : 0;
  if (data.circuit_state === 'open' && openUntil > Date.now()) throw new Error('PROVIDER_CIRCUIT_OPEN');
  if (data.circuit_state === 'open') {
    const { error: updateError } = await admin.from('external_provider_state').update({
      circuit_state: 'half_open',
      updated_at: new Date().toISOString(),
    }).eq('provider', provider).eq('circuit_state', 'open');
    if (updateError) throw new Error(`PROVIDER_STATE_UPDATE_FAILED:${updateError.code || 'unknown'}`);
  }
}

export async function finishExternalProviderRun(
  admin: AdminClient,
  runId: string,
  provider: string,
  counts: { itemCount: number; pageCount: number; checkpoint?: Record<string, unknown>; costUnits?: number },
) {
  const now = new Date().toISOString();
  const { error: runError } = await admin.from('external_provider_sync_runs').update({
    status: 'succeeded',
    item_count: counts.itemCount,
    page_count: counts.pageCount,
    checkpoint: counts.checkpoint ?? {},
    finished_at: now,
  }).eq('id', runId);
  if (runError) throw new Error(`PROVIDER_RUN_FINISH_FAILED:${runError.code || 'unknown'}`);
  const { error: stateError } = await admin.from('external_provider_state').upsert({
    provider,
    circuit_state: 'closed',
    consecutive_failures: 0,
    circuit_open_until: null,
    last_success_at: now,
    last_error_kind: null,
    last_error_code: null,
    last_checkpoint: counts.checkpoint ?? {},
    updated_at: now,
  }, { onConflict: 'provider' });
  if (stateError) throw new Error(`PROVIDER_STATE_UPDATE_FAILED:${stateError.code || 'unknown'}`);
  if ((counts.costUnits ?? 0) > 0) {
    const { error: costError } = await admin.rpc('record_external_provider_cost', {
      p_run_id: runId,
      p_provider: provider,
      p_cost_units: counts.costUnits,
    });
    if (costError) throw new Error(`PROVIDER_COST_RECORD_FAILED:${costError.code || 'unknown'}`);
  }
}

export async function failExternalProviderRun(
  admin: AdminClient,
  runId: string | null,
  provider: string,
  error: unknown,
  options: { action?: string; payloadDigest?: string | null; safeContext?: Record<string, unknown> } = {},
) {
  const now = new Date().toISOString();
  const providerError = error as Partial<ProviderFetchError>;
  const kind = providerError.kind || 'unknown';
  const code = typeof providerError.status === 'number' ? String(providerError.status) : 'provider_failure';
  if (runId) {
    await admin.from('external_provider_sync_runs').update({
      status: 'failed', error_kind: kind, error_code: code, failure_sample_redacted: `${provider} ${kind}`,
      finished_at: now,
    }).eq('id', runId);
  }
  const { data: current } = await admin.from('external_provider_state')
    .select('consecutive_failures').eq('provider', provider).maybeSingle();
  const failures = Number(current?.consecutive_failures || 0) + 1;
  await admin.from('external_provider_state').upsert({
    provider,
    circuit_state: failures >= 3 ? 'open' : 'closed',
    consecutive_failures: failures,
    circuit_open_until: failures >= 3 ? new Date(Date.now() + 60_000).toISOString() : null,
    last_error_at: now,
    last_error_kind: kind,
    last_error_code: code,
    updated_at: now,
  }, { onConflict: 'provider' });

  if (failures >= 3) {
    const { error: deadLetterError } = await admin.rpc('record_external_provider_dead_letter', {
      p_run_id: runId,
      p_provider: provider,
      p_action: options.action || 'sync',
      p_error_kind: kind,
      p_error_code: code,
      p_payload_digest: options.payloadDigest || null,
      p_safe_context: options.safeContext || {},
    });
    if (!deadLetterError && runId) {
      await admin.from('external_provider_sync_runs').update({ status: 'dead_letter' }).eq('id', runId);
    }
  }
}
