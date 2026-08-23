import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/delete-account/index.ts'), 'utf8');

describe('delete-account compatibility Edge contract', () => {
  it('schedules the governed deletion workflow instead of hard-deleting user data', () => {
    expect(source).toContain("client.rpc('request_my_data_subject_action_v2'");
    expect(source).toContain("_request_type: 'deletion'");
    expect(source).toContain('scheduled: true');
    expect(source).not.toContain('.auth.admin.deleteUser(');
    expect(source).not.toMatch(/\.from\(['"](?:profiles|events|event_participants)['"]\)\.delete/);
    expect(source).not.toContain('getSupabaseAdmin');
  });

  it('requires a verified caller and bounds legacy input without returning raw errors', () => {
    expect(source).toContain('requireAuthenticatedUserClient(req)');
    expect(source).toContain('MAX_BODY_BYTES');
    expect(source).toContain('SAFE_ERROR_CODES');
    expect(source).toContain("'Cache-Control': 'no-store'");
    expect(source).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(?:error|message|rawCode)/);
  });
});
