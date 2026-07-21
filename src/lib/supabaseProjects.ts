/**
 * Multi-Supabase project runtime assertion.
 *
 * See `docs/MULTI_SUPABASE_CONTRACT.md`. The frontend must talk to the
 * target ("dsym") project. If build-time env swaps drift and the client
 * ends up bound to the Lovable Cloud project (or any other), we want a
 * loud, name-only console warning at boot instead of silent data loss.
 *
 * This module is pure information + a boot-time check. It does not
 * mutate the Supabase client (which is auto-generated); it only
 * observes and warns.
 */

export const TARGET_SUPABASE_PROJECT_REF = "dsymdijzydaehntlmfzl" as const;

export const KNOWN_PROJECT_REFS = {
  target: "dsymdijzydaehntlmfzl",
  lovableCloud: "olzvughcoqnfkdpvbwjy",
} as const;

export type KnownProjectRole = keyof typeof KNOWN_PROJECT_REFS;

/** Extract the project ref (subdomain) from a Supabase URL. */
export function extractProjectRef(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Return the role of a project ref, if it is one we know about. */
export function classifyProjectRef(ref: string | null): KnownProjectRole | "unknown" {
  if (!ref) return "unknown";
  const entry = Object.entries(KNOWN_PROJECT_REFS).find(([, v]) => v === ref);
  return (entry?.[0] as KnownProjectRole | undefined) ?? "unknown";
}

export interface AssertionResult {
  ok: boolean;
  ref: string | null;
  role: KnownProjectRole | "unknown";
  message?: string;
}

/**
 * Validate that a Supabase URL points at the expected target project.
 * Never logs or returns the key — only the project ref (safe, public).
 */
export function assertTargetProject(url: string | null | undefined): AssertionResult {
  const ref = extractProjectRef(url);
  const role = classifyProjectRef(ref);
  if (ref === TARGET_SUPABASE_PROJECT_REF) {
    return { ok: true, ref, role };
  }
  const message =
    role === "lovableCloud"
      ? `Frontend is bound to the Lovable Cloud project (${ref}) instead of the target (${TARGET_SUPABASE_PROJECT_REF}). Check VITE_SUPABASE_URL and vite.config.ts overrides.`
      : `Frontend is bound to an unknown Supabase project (${ref ?? "none"}); expected ${TARGET_SUPABASE_PROJECT_REF}.`;
  return { ok: false, ref, role, message };
}
