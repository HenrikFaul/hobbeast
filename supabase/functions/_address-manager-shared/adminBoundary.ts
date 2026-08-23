import { requireAdminUser } from '../shared/adminAuth.ts';
import type { SupabaseAdminClient } from './edgeRuntime.ts';
import { ADDRESS_MANAGER_CAPABILITY, AddressManagerError } from './requestContract.ts';

export async function requireAddressManagerAdmin(req: Request, admin: SupabaseAdminClient) {
  const authHeader = String(req.headers.get('authorization') || '').trim();
  if (!/^Bearer\s+\S+$/i.test(authHeader)) {
    throw new AddressManagerError('AUTH_REQUIRED', 401);
  }

  let user: { id: string };
  try {
    user = await requireAdminUser(req, admin);
  } catch {
    throw new AddressManagerError('AUTH_REQUIRED', 401);
  }

  const { data, error } = await admin.rpc('admin_has_capability', {
    _user_id: user.id,
    _capability_key: ADDRESS_MANAGER_CAPABILITY,
  });
  if (error) throw new AddressManagerError('CAPABILITY_CHECK_FAILED', 500);
  if (data !== true) throw new AddressManagerError('ADMIN_CAPABILITY_REQUIRED', 403);
  return user;
}
