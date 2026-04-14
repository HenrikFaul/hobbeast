import type { SyncBody } from '../types/index.ts';
import { executeSyncBatch } from '../orchestrators/runBatch.ts';

export async function handleEnqueue(
  supabaseAdmin: any,
  effectiveBody: SyncBody,
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  runId: string,
) {
  await appendLog('info', 'batch_enqueued', 'Lokális batch közvetlen futtatással elindítva', {
    reset: effectiveBody.reset === true,
    mode: 'inline_execute',
    request_id: runId,
  }, runId);

  const result = await executeSyncBatch(supabaseAdmin, effectiveBody, runId, appendLog);
  return { ...result, requestId: runId, enqueueMode: 'inline_execute' };
}
