// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin, jsonResponse, safeServe } from '../_address-manager-shared/edgeRuntime.ts';
import { requireAddressManagerAdmin } from '../_address-manager-shared/adminBoundary.ts';
import { loadLimits, releaseStaleLocks } from '../_address-manager-shared/repository.ts';
import {
  AddressManagerError,
  assertAddressManagerPost,
  boundedString,
  readBoundedJsonObject,
  sha256Hex,
} from '../_address-manager-shared/requestContract.ts';

type MatrixRow = {
  id: string;
  provider: string;
  country_code: string;
  category_key: string;
  cursor: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
};

type TaskLease = {
  token: string;
  idempotency_hash: string;
  state: 'claimed' | 'working';
  claimed_at: string;
  worker_run_id?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readTaskLease(stats: unknown): TaskLease | null {
  const lock = record(record(stats).address_manager_lock);
  const token = String(lock.token || '');
  const idempotencyHash = String(lock.idempotency_hash || '');
  const state = String(lock.state || '');
  const claimedAt = String(lock.claimed_at || '');
  if (!token || !/^[a-f0-9]{64}$/.test(idempotencyHash) || !['claimed', 'working'].includes(state) || !claimedAt) return null;
  return {
    token,
    idempotency_hash: idempotencyHash,
    state: state as TaskLease['state'],
    claimed_at: claimedAt,
    worker_run_id: lock.worker_run_id ? String(lock.worker_run_id) : undefined,
  };
}

function buildTask(row: MatrixRow, lease: TaskLease, limits: Record<string, unknown>) {
  return {
    matrix_id: row.id,
    provider: row.provider,
    country_code: row.country_code,
    category_key: row.category_key,
    cursor: row.cursor || {},
    limits,
    lock_token: lease.token,
    idempotency_hash: lease.idempotency_hash,
    generated_at: lease.claimed_at,
  };
}

serve(safeServe(async (req, { correlationId }) => {
  assertAddressManagerPost(req);
  const body = await readBoundedJsonObject(req, 4 * 1024);
  const supabaseAdmin = getSupabaseAdmin(req);
  await requireAddressManagerAdmin(req, supabaseAdmin);

  const requestedIdempotencyKey = body.idempotency_key ?? req.headers.get('x-idempotency-key') ?? crypto.randomUUID();
  const idempotencyKey = boundedString(
    requestedIdempotencyKey,
    'idempotency_key',
    96,
    { required: true, pattern: /^[a-zA-Z0-9:_-]+$/ },
  );
  const idempotencyHash = await sha256Hex(idempotencyKey);
  const limits = await loadLimits(supabaseAdmin);

  await releaseStaleLocks(supabaseAdmin, 10);

  // Completed/partial invocations retain only the hash, so replaying the same
  // request cannot claim a new provider-cost task.
  const { data: completedReplay, error: completedReplayError } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .select('id')
    .contains('stats', { address_manager_last_idempotency_hash: idempotencyHash })
    .limit(1)
    .maybeSingle();
  if (completedReplayError) throw completedReplayError;
  if (completedReplay) {
    return jsonResponse({
      ok: true,
      generated: false,
      reason: 'idempotent_replay',
    }, 200, correlationId);
  }

  const { data: runningRows, error: runningError } = await supabaseAdmin
    .from('sync_discovery_matrix')
    .select('id,provider,country_code,category_key,cursor,stats')
    .eq('selected', true)
    .eq('status', 'running')
    .order('last_run_started_at', { ascending: true })
    .limit(20);
  if (runningError) throw runningError;

  // If a response was lost after the lease was created, return the same lease
  // instead of advancing to another matrix cell.
  const activeReplay = ((runningRows || []) as MatrixRow[]).find((row) => (
    readTaskLease(row.stats)?.idempotency_hash === idempotencyHash
  ));
  if (activeReplay) {
    const lease = readTaskLease(activeReplay.stats);
    if (!lease) throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
    return jsonResponse({
      ok: true,
      generated: true,
      idempotent_replay: true,
      task: buildTask(activeReplay, lease, limits as unknown as Record<string, unknown>),
    }, 200, correlationId);
  }

  if ((runningRows || []).length >= limits.max_parallel_workers) {
    return jsonResponse({
      ok: true,
      generated: false,
      reason: 'no_free_worker_slots',
      runningCount: (runningRows || []).length,
      maxParallelWorkers: limits.max_parallel_workers,
    }, 200, correlationId);
  }

  // Optimistic compare-and-set claim. Concurrent generators may select the
  // same candidate, but only one can change pending/error -> running.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: nextCell, error: nextError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .select('id,provider,country_code,category_key,cursor,stats')
      .eq('selected', true)
      .in('status', ['pending', 'error'])
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextError) throw nextError;
    if (!nextCell) {
      return jsonResponse({ ok: true, generated: false, reason: 'done' }, 200, correlationId);
    }

    const claimedAt = new Date().toISOString();
    const lease: TaskLease = {
      token: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      idempotency_hash: idempotencyHash,
      state: 'claimed',
      claimed_at: claimedAt,
    };
    const claimedStats = { ...record(nextCell.stats), address_manager_lock: lease };
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('sync_discovery_matrix')
      .update({
        status: 'running',
        stats: claimedStats,
        last_error: null,
        last_run_started_at: claimedAt,
        updated_at: claimedAt,
      })
      .eq('id', nextCell.id)
      .eq('selected', true)
      .in('status', ['pending', 'error'])
      .select('id,provider,country_code,category_key,cursor,stats')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    return jsonResponse({
      ok: true,
      generated: true,
      task: buildTask(claimed as MatrixRow, lease, limits as unknown as Record<string, unknown>),
    }, 200, correlationId);
  }

  throw new AddressManagerError('TASK_LEASE_CONFLICT', 409);
}, 'address-manager-task-generator'));
