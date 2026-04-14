import { saveSyncConfig } from '../repositories/configRepo.ts';

export async function handleSaveConfig(
  supabaseAdmin: any,
  configInput: Record<string, unknown> | undefined,
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  runId: string,
) {
  const config = await saveSyncConfig(supabaseAdmin, configInput as any);
  await appendLog('info', 'config_saved', 'Lokális sync konfiguráció elmentve', config as unknown as Record<string, unknown>, runId);
  return { ok: true, config };
}
