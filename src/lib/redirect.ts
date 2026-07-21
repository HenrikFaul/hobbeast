/**
 * Sanitize a `redirect` query parameter for post-auth navigation.
 *
 * Rules (P0 hardening, v1.7.4):
 * - Only relative, single-slash, internal paths are honored.
 * - Reject `//host`, protocol-relative, backslash-prefixed, `javascript:`
 *   and any absolute URL (`http:`, `https:`, `data:`, etc.).
 * - Malformed URI-encoded input falls back to `/`.
 *
 * Returns a safe path (always starts with a single `/`).
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/")) return "/";
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  if (/^\s*javascript:/i.test(decoded)) return "/";
  // must not contain a scheme
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return "/";
  return decoded;
}
