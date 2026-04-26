import { MILESTONES } from '../constants/sync.ts';
import type { SyncBody } from '../types/index.ts';
import { executeSyncBatch } from '../orchestrators/runBatch.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function handleEnqueue(
  supabaseAdmin: any,
  effectiveBody: SyncBody,
  appendLog: AppendLog,
  runId: string,
) {
  await appendLog('info', MILESTONES.ENQUEUE_REQUEST_ACCEPTED, 'Batch enqueue request accepted — starting inline execution', {
    reset: effectiveBody.reset === true,
    mode: 'inline_execute',
    run_id: runId,
  }, runId);

  const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId, appendLog);
  return { ...result, requestId: runId, enqueueMode: 'inline_execute' };
}
