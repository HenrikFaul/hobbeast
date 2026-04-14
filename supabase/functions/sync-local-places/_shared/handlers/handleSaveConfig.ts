import { MILESTONES } from '../constants/sync.ts';
import { saveSyncConfig } from '../repositories/configRepo.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

export async function handleSaveConfig(
  supabaseAdmin: any,
  configInput: Record<string, unknown> | undefined,
  appendLog: AppendLog,
  runId: string,
) {
  await appendLog('info', MILESTONES.CONFIG_SAVE_STARTED, 'Saving sync config', configInput ?? {}, runId);
  const config = await saveSyncConfig(supabaseAdmin, configInput as any);
  await appendLog('info', MILESTONES.CONFIG_SAVE_DONE, 'Sync config saved', config as unknown as Record<string, unknown>, runId);
  return { ok: true, config };
}
