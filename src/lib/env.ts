import { z } from "zod";

/**
 * Frontend runtime configuration, validated once at module load.
 *
 * Never place server-only secrets here — anything read from `import.meta.env`
 * that lacks the `VITE_` prefix is unavailable in the browser bundle by
 * design. The validator only accepts `VITE_*` variables and refuses
 * placeholder values so a misconfigured deploy fails loudly instead of
 * silently pointing at the wrong project.
 */

const supabaseUrlSchema = z
  .string()
  .min(1, "VITE_SUPABASE_URL is required")
  .url("VITE_SUPABASE_URL must be a valid URL")
  .refine((v) => !/\{\{.+\}\}/.test(v), "VITE_SUPABASE_URL contains an unresolved placeholder")
  .transform((v) => v.replace(/\/+$/, ""));

const nonPlaceholderString = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .refine((v) => !/\{\{.+\}\}/.test(v), `${name} contains an unresolved placeholder`);

const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: supabaseUrlSchema,
  VITE_SUPABASE_PUBLISHABLE_KEY: nonPlaceholderString("VITE_SUPABASE_PUBLISHABLE_KEY"),
  VITE_SUPABASE_PROJECT_ID: nonPlaceholderString("VITE_SUPABASE_PROJECT_ID").optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function readRawEnv(): Record<string, string | undefined> {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return {
    VITE_SUPABASE_URL: meta?.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: meta?.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PROJECT_ID: meta?.VITE_SUPABASE_PROJECT_ID,
  };
}

function validate(): PublicEnv | null {
  const parsed = publicEnvSchema.safeParse(readRawEnv());
  if (!parsed.success) {
    // Log names only, never values. This keeps secrets out of logs even when
    // the misconfiguration happens in a debugging session.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("[env] Frontend runtime configuration is invalid:", issues);
    return null;
  }
  return parsed.data;
}

export const env: PublicEnv | null = validate();

export function requireEnv(): PublicEnv {
  if (!env) {
    throw new Error(
      "Frontend runtime configuration is invalid. Check the console for the failing variable names.",
    );
  }
  return env;
}
