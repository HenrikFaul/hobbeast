export type AdminBulkMode = 'preview' | 'apply' | 'status';

const MODE_BODY_KEYS: Record<AdminBulkMode, readonly string[]> = {
  status: ['mode', 'jobId'],
  preview: ['mode', 'reason', 'filters'],
  apply: [
    'mode',
    'action',
    'reason',
    'confirmation',
    'idempotencyKey',
    'approvalRequestId',
    'filterSnapshot',
    'userIds',
    'profileIds',
  ],
};

export function assertAllowedAdminBulkBodyKeys(
  body: Record<string, unknown>,
  mode: AdminBulkMode,
) {
  const allowed = new Set(MODE_BODY_KEYS[mode]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new Error('INVALID_BODY_FIELDS');
  }
}

export function missingRequestedIds(
  requestedIds: readonly string[],
  resolvedIds: readonly string[],
) {
  const resolved = new Set(resolvedIds);
  return requestedIds.filter((id) => !resolved.has(id));
}

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('INVALID_CHUNK_SIZE');
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}
