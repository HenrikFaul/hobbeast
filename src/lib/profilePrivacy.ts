/**
 * Profile privacy helpers.
 *
 * Implements the "public profile DTO" rule: a public profile view must never
 * receive the full `profiles` record. Only explicitly whitelisted, coarse
 * fields may be exposed to other users. Private fields (exact address,
 * exact coordinates, contact channels) stay server/client-side private.
 *
 * Purely functional — no Supabase import, so it is trivially unit-testable.
 */

export interface ProfileRecordLike {
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  gender_public?: boolean | null;
  age_public?: boolean | null;
  address?: string | null;
  address_public?: boolean | null;
  city?: string | null;
  hobbies?: string[] | null;
  email?: string | null;
  phone?: string | null;
  location_lat?: number | null;
  location_lon?: number | null;
  [key: string]: unknown;
}

export interface PublicProfileDto {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  hobbies: string[];
  /** True only when the owner explicitly opted in. */
  gender_public: boolean;
  /** True only when the owner explicitly opted in. */
  age_public: boolean;
  /**
   * Coarse city-level location indicator. Never the exact address or
   * exact coordinates. `null` when the owner has no city set.
   */
  city_area: string | null;
}

const PRIVATE_KEYS = [
  'email',
  'phone',
  'address',
  'location_lat',
  'location_lon',
  'date_of_birth',
  'raw_user_meta_data',
] as const;

/**
 * Build a public, safe DTO from a full `profiles` row.
 *
 * - Private keys are never copied.
 * - `date_of_birth` is never copied (age is exposed only via `age_public`
 *   consent and even then only as a coarse flag in a future step, never as
 *   the raw birth date).
 * - Hobbies are normalized to a string array.
 */
export function buildPublicProfileDto(row: ProfileRecordLike): PublicProfileDto {
  // Copy the input so the function is side-effect free — never mutate the
  // caller's profile record.
  const source: ProfileRecordLike = { ...row };

  const privateKeySet = new Set<string>(PRIVATE_KEYS);
  for (const key of Object.keys(source)) {
    if (privateKeySet.has(key)) {
      delete (source as Record<string, unknown>)[key];
    }
  }

  const hobbies = Array.isArray(source.hobbies)
    ? source.hobbies
        .map((h) => (h == null ? '' : String(h).trim()))
        .filter((h) => h.length > 0)
    : [];

  return {
    user_id: String(source.user_id ?? ''),
    display_name: String(source.display_name ?? ''),
    avatar_url: typeof source.avatar_url === 'string' && source.avatar_url ? source.avatar_url : null,
    city: typeof source.city === 'string' && source.city.trim() ? source.city.trim() : null,
    hobbies,
    gender_public: Boolean(source.gender_public),
    age_public: Boolean(source.age_public),
    city_area: typeof source.city === 'string' && source.city.trim() ? source.city.trim() : null,
  };
}

/**
 * List of keys that must never appear in a public profile payload.
 * Used by tests to assert DTO shape inversion (no private leakage).
 */
export const PUBLIC_PROFILE_FORBIDDEN_KEYS: readonly string[] = PRIVATE_KEYS;