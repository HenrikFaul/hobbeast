// Shared Edge Function environment helper.
//
// Every Edge Function must call `requireEnv([...])` at startup to fail fast
// with a clear, secret-free error when a required secret is missing. Never
// log the value of a secret; only its name.

export type EnvName = string;

export class MissingEnvError extends Error {
  constructor(public readonly missing: EnvName[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

export function readEnv(name: EnvName): string | undefined {
  // Deno first (Edge Function runtime), then Node fallback for local tests.
  const denoEnv = (globalThis as unknown as {
    Deno?: { env?: { get?: (n: string) => string | undefined } };
  }).Deno?.env;
  if (denoEnv?.get) return denoEnv.get(name);
  const nodeEnv = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return nodeEnv?.[name];
}

export function requireEnv<T extends readonly EnvName[]>(names: T): Record<T[number], string> {
  const out = {} as Record<T[number], string>;
  const missing: EnvName[] = [];
  for (const name of names) {
    const value = readEnv(name);
    if (!value || /\{\{.+\}\}/.test(value)) {
      missing.push(name);
      continue;
    }
    (out as Record<string, string>)[name] = value;
  }
  if (missing.length) {
    // Log names only, never values.
    console.error("[edge-env] missing required secrets", { missing });
    throw new MissingEnvError(missing);
  }
  return out;
}

/** Redact a secret-like value in log output. Keeps only the first/last 2 chars. */
export function redact(value: string | undefined | null): string {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
