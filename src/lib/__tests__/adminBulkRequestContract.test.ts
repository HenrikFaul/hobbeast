import { describe, expect, it } from 'vitest';
import {
  assertAllowedAdminBulkBodyKeys,
  chunkValues,
  missingRequestedIds,
} from '../../../supabase/functions/admin-bulk-user-actions/requestContract';

describe('admin bulk request contract', () => {
  it('uses a different request-body allowlist for each mode', () => {
    expect(() => assertAllowedAdminBulkBodyKeys({ mode: 'status', jobId: 'id' }, 'status')).not.toThrow();
    expect(() => assertAllowedAdminBulkBodyKeys({ mode: 'status', jobId: 'id', reason: 'unexpected' }, 'status'))
      .toThrow('INVALID_BODY_FIELDS');
    expect(() => assertAllowedAdminBulkBodyKeys({ mode: 'preview', reason: 'audit', filters: {} }, 'preview')).not.toThrow();
    expect(() => assertAllowedAdminBulkBodyKeys({ mode: 'preview', reason: 'audit', userIds: [] }, 'preview'))
      .toThrow('INVALID_BODY_FIELDS');
  });

  it('detects every unresolved requested profile id independently', () => {
    expect(missingRequestedIds(['profile-a', 'profile-b'], ['profile-a'])).toEqual(['profile-b']);
    expect(missingRequestedIds(['user-a'], ['user-a'])).toEqual([]);
  });

  it('chunks every owner id so organizer-only event queries cannot be truncated', () => {
    const ids = Array.from({ length: 501 }, (_, index) => `owner-${index}`);
    const chunks = chunkValues(ids, 200);
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 101]);
    expect(chunks.flat()).toEqual(ids);
  });
});
