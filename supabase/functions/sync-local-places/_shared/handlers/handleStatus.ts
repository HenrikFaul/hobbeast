import { getStatus } from '../services/statusService.ts';

export async function handleStatus(supabaseAdmin: any) {
  return getStatus(supabaseAdmin);
}
