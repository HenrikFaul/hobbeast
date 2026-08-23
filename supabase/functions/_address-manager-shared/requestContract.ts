import type { AddressManagerLimits } from './types.ts';

export const ADDRESS_MANAGER_CAPABILITY = 'providers.manage' as const;
export const ADDRESS_MANAGER_MAX_BODY_BYTES = 64 * 1024;
export const ADDRESS_MANAGER_MAX_PROVIDER_REQUESTS_PER_WORKER = 20;
export const ADDRESS_MANAGER_MAX_TILES_PER_WORKER = 5;
export const ADDRESS_MANAGER_MAX_ROWS_PER_WORKER = 5_000;
export const ADDRESS_MANAGER_TASK_LEASE_MS = 10 * 60 * 1000;
export const ADDRESS_MANAGER_MAX_RUN_CHUNK_ITERATIONS = 1;

export const ADDRESS_MANAGER_LIMIT_RANGES = {
  geoapify_limit: { min: 1, max: 5_000 },
  tomtom_limit: { min: 1, max: 1_000 },
  radius_meters: { min: 1_000, max: 200_000 },
  worker_chunk_size: { min: 1, max: 10 },
  max_parallel_workers: { min: 1, max: 4 },
  worker_time_budget_ms: { min: 5_000, max: 45_000 },
  worker_max_pages_per_tile: { min: 1, max: 20 },
} as const satisfies Record<keyof AddressManagerLimits, { min: number; max: number }>;

export type AddressManagerErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'SCHEDULER_DISABLED'
  | 'AUTH_REQUIRED'
  | 'ADMIN_CAPABILITY_REQUIRED'
  | 'CAPABILITY_CHECK_FAILED'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_JSON_BODY'
  | 'REQUEST_BODY_TOO_LARGE'
  | 'INVALID_ACTION'
  | 'INVALID_PARAMETER'
  | 'INVALID_TASK'
  | 'TASK_LEASE_CONFLICT'
  | 'TASK_LEASE_EXPIRED'
  | 'TASK_ALREADY_RUNNING'
  | 'PROVIDER_CONFIG_MISSING'
  | 'PROVIDER_REQUEST_FAILED'
  | 'PROVIDER_RESPONSE_TOO_LARGE'
  | 'INTERNAL_FUNCTION_FAILED'
  | 'INTERNAL_ERROR';

export class AddressManagerError extends Error {
  constructor(
    readonly code: AddressManagerErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'AddressManagerError';
  }
}

export function correlationIdFromRequest(req: Request): string {
  const candidate = String(req.headers.get('x-correlation-id') || '').trim();
  if (/^[a-zA-Z0-9_-]{8,96}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}

export function assertAddressManagerPost(req: Request) {
  if (req.method !== 'POST') throw new AddressManagerError('METHOD_NOT_ALLOWED', 405);

  // There is deliberately no scheduler authentication fallback yet. A future
  // scheduler must add a server-held signing secret, bounded timestamp and a
  // durable replay nonce store together; accepting any body/header flag would
  // turn verify_jwt=false into a public service-role write boundary.
  const schedulerHeaders = [
    'x-address-manager-scheduler',
    'x-address-manager-signature',
    'x-address-manager-timestamp',
    'x-scheduler-signature',
  ];
  if (schedulerHeaders.some((header) => req.headers.has(header))) {
    throw new AddressManagerError('SCHEDULER_DISABLED', 403);
  }
}

export async function readBoundedJsonObject(
  req: Request,
  maxBytes = ADDRESS_MANAGER_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AddressManagerError('REQUEST_BODY_TOO_LARGE', 413);
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new AddressManagerError('REQUEST_BODY_TOO_LARGE', 413);
  }
  if (!text.trim()) return {};

  const contentType = String(req.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    throw new AddressManagerError('INVALID_CONTENT_TYPE', 415);
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AddressManagerError('INVALID_JSON_BODY', 400);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AddressManagerError) throw error;
    throw new AddressManagerError('INVALID_JSON_BODY', 400);
  }
}

export function requireRecord(value: unknown, parameter: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  void parameter;
  return value as Record<string, unknown>;
}

export function boundedInteger(
  value: unknown,
  parameter: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    void parameter;
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  return parsed;
}

export function boundedString(
  value: unknown,
  parameter: string,
  maxLength: number,
  options: { required?: boolean; pattern?: RegExp } = {},
): string {
  const normalized = String(value ?? '').trim();
  if ((options.required && !normalized) || normalized.length > maxLength || (normalized && options.pattern && !options.pattern.test(normalized))) {
    void parameter;
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  return normalized;
}

export function boundedStringArray(
  value: unknown,
  parameter: string,
  options: { maxItems: number; maxItemLength: number; pattern?: RegExp; transform?: (item: string) => string },
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > options.maxItems) {
    void parameter;
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }
  const values = value.map((item) => {
    const normalized = String(item ?? '').trim();
    const transformed = options.transform ? options.transform(normalized) : normalized;
    if (!transformed || transformed.length > options.maxItemLength || (options.pattern && !options.pattern.test(transformed))) {
      throw new AddressManagerError('INVALID_PARAMETER', 400);
    }
    return transformed;
  });
  return [...new Set(values)];
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function enforceAddressManagerLimits(
  value: Partial<AddressManagerLimits> | Record<string, unknown> | null | undefined,
  fallback: AddressManagerLimits,
): AddressManagerLimits {
  const source = value || {};
  return Object.fromEntries(
    (Object.keys(ADDRESS_MANAGER_LIMIT_RANGES) as Array<keyof AddressManagerLimits>).map((key) => {
      const range = ADDRESS_MANAGER_LIMIT_RANGES[key];
      return [key, clampInteger(source[key], fallback[key], range.min, range.max)];
    }),
  ) as AddressManagerLimits;
}

export function validateAddressManagerLimitsPatch(value: unknown): Partial<AddressManagerLimits> {
  const source = requireRecord(value, 'limits');
  const allowedKeys = new Set(Object.keys(ADDRESS_MANAGER_LIMIT_RANGES));
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) {
    throw new AddressManagerError('INVALID_PARAMETER', 400);
  }

  const result: Partial<AddressManagerLimits> = {};
  for (const key of Object.keys(source) as Array<keyof AddressManagerLimits>) {
    const range = ADDRESS_MANAGER_LIMIT_RANGES[key];
    result[key] = boundedInteger(source[key], key, range.min, range.max);
  }
  return result;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

export function publicDiscoveryStats(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => (
    !key.startsWith('address_manager_')
  )));
}
