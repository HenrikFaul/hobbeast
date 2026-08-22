export interface DeliveryPayload {
  notificationId: string;
  title: string;
  body: string;
  deepLink: string | null;
  category: string;
}

export interface ProviderDeliveryResult {
  ok: boolean;
  providerMessageId: string | null;
  responseCode: string;
  errorCode: string | null;
  retryable: boolean;
}

const SAFE_PATH = /^\/[A-Za-z0-9/_?=&%+.,:@~-]{0,500}$/;

export function safeInternalDeepLink(value: unknown): string | null {
  return typeof value === 'string' && SAFE_PATH.test(value) && !value.startsWith('//') ? value : null;
}

export function classifyDeliveryStatus(status: number): { retryable: boolean; errorCode: string } {
  if (status === 408) return { retryable: true, errorCode: 'PROVIDER_TIMEOUT' };
  if (status === 429) return { retryable: true, errorCode: 'PROVIDER_RATE_LIMIT' };
  if (status >= 500) return { retryable: true, errorCode: 'PROVIDER_UNAVAILABLE' };
  return { retryable: false, errorCode: `PROVIDER_HTTP_${status}` };
}

export async function deliverProviderJson(input: {
  url: string;
  token: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ProviderDeliveryResult> {
  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}` },
      body: JSON.stringify(input.payload),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(input.timeoutMs || 10_000, 30_000))),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const classified = classifyDeliveryStatus(response.status);
      return { ok: false, providerMessageId: null, responseCode: String(response.status), ...classified };
    }
    let providerMessageId: string | null = null;
    try {
      const body = await response.json() as Record<string, unknown>;
      const rawId = body.id ?? body.message_id ?? body.messageId;
      providerMessageId = typeof rawId === 'string' ? rawId.slice(0, 200) : null;
    } catch {
      // A successful provider is not required to return JSON.
    }
    return { ok: true, providerMessageId, responseCode: String(response.status), errorCode: null, retryable: false };
  } catch (error) {
    const timeout = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      providerMessageId: null,
      responseCode: timeout ? 'timeout' : 'network_error',
      errorCode: timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR',
      retryable: true,
    };
  }
}

export function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}
