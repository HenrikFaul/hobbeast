import { loadSyncConfig } from '../repositories/configRepo.ts';

export async function handleGetConfig(supabaseAdmin: any) {
  const config = await loadSyncConfig(supabaseAdmin);
  return { config };
}
