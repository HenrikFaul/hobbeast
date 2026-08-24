const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

export async function signEventFeedCronPayload(secret: string, timestamp: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  return `v1=${toHex(new Uint8Array(signature))}`;
}

export async function verifyEventFeedCronRequest(input: {
  request: Request;
  rawBody: string;
  secret: string;
  nowMs?: number;
  maxSkewSeconds?: number;
}) {
  if (input.secret.length < 32) return false;
  const timestamp = String(input.request.headers.get('x-hobbeast-timestamp') || '').trim();
  const signature = String(input.request.headers.get('x-hobbeast-signature') || '').trim().toLowerCase();
  if (!/^\d{10,13}$/.test(timestamp) || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;

  const epoch = Number(timestamp);
  const timestampMs = timestamp.length === 13 ? epoch : epoch * 1000;
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > (input.maxSkewSeconds ?? 300) * 1000) {
    return false;
  }

  const expected = await signEventFeedCronPayload(input.secret, timestamp, input.rawBody);
  return constantTimeEqual(expected, signature);
}
