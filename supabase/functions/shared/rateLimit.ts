import type { SupabaseAdminClient } from './providerFetch.ts';

function firstForwardedAddress(request: Request) {
  return (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 100);
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function rateLimitSubjectHash(input: {
  request: Request;
  userId?: string | null;
  pepper: string;
}) {
  if (!input.pepper.trim()) throw new Error('RATE_LIMIT_PEPPER_MISSING');
  const subject = input.userId
    ? `user:${input.userId}`
    : `guest:${firstForwardedAddress(input.request)}:${(input.request.headers.get('user-agent') || 'unknown').slice(0, 160)}`;
  return sha256Hex(`${input.pepper}:${subject}`);
}

export async function consumeEdgeRateLimit(input: {
  admin: SupabaseAdminClient;
  endpoint: string;
  subjectHash: string;
  windowSeconds: number;
  requestLimit: number;
}) {
  const { data, error } = await input.admin.rpc('consume_edge_rate_limit', {
    p_endpoint: input.endpoint,
    p_subject_hash: input.subjectHash,
    p_window_seconds: input.windowSeconds,
    p_request_limit: input.requestLimit,
  });
  if (error) throw new Error(`RATE_LIMIT_CHECK_FAILED:${error.code || 'unknown'}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    remaining: Math.max(0, Number(row?.remaining) || 0),
    retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds) || 0),
  };
}
