import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const TARGET_SUPABASE_PROJECT_REF = "dsymdijzydaehntlmfzl";
const PACKAGE_VERSION = String(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version || "local-unknown");

function normalizeUrl(value?: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractProjectRef(url?: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";

  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return "";
    const projectRef = hostname.slice(0, -suffix.length);
    return projectRef && !projectRef.includes(".") ? projectRef : "";
  } catch {
    return "";
  }
}

function createSupabaseClientTransformPlugin(supabaseUrl: string, supabaseKey: string) {
  return {
    name: "transform-supabase-client-env",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const normalizedId = id.replace(/\\/g, "/");
      if (!normalizedId.endsWith("/src/integrations/supabase/client.ts")) return null;

      return {
        code: code
          .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, JSON.stringify(supabaseUrl))
          .replace(/import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/g, JSON.stringify(supabaseKey)),
        map: null,
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const releaseVersion = String(env.VITE_RELEASE_VERSION || PACKAGE_VERSION).trim();
  const buildCommitSha = String(env.VITE_BUILD_COMMIT_SHA || "local").trim();
  const buildTimestamp = String(env.VITE_BUILD_TIMESTAMP || new Date().toISOString()).trim();
  // The browser contract is VITE_* only. Falling back to server-scoped SUPABASE_*
  // can hide a misconfigured frontend pair and makes the built target differ from
  // the environment the rest of the frontend tooling validates.
  const resolvedSupabaseUrl = normalizeUrl(env.VITE_SUPABASE_URL);
  const resolvedSupabaseKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const configuredProjectId = String(env.VITE_SUPABASE_PROJECT_ID || "").trim();
  const urlProjectId = extractProjectRef(resolvedSupabaseUrl);

  if (
    mode === "production" &&
    (
      urlProjectId !== TARGET_SUPABASE_PROJECT_REF ||
      configuredProjectId !== TARGET_SUPABASE_PROJECT_REF ||
      !resolvedSupabaseUrl ||
      !resolvedSupabaseKey
    )
  ) {
    throw new Error(
      `[SupabaseConfig] Production build blocked: VITE_* must consistently target ${TARGET_SUPABASE_PROJECT_REF}; received URL ref ${urlProjectId || "missing-or-invalid-host"} and project id ${configuredProjectId || "missing"}.`,
    );
  }

  const resolvedProjectId = urlProjectId || configuredProjectId;

  if (resolvedSupabaseUrl) process.env.VITE_SUPABASE_URL = resolvedSupabaseUrl;
  if (resolvedSupabaseKey) process.env.VITE_SUPABASE_PUBLISHABLE_KEY = resolvedSupabaseKey;
  if (resolvedProjectId) process.env.VITE_SUPABASE_PROJECT_ID = resolvedProjectId;

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [createSupabaseClientTransformPlugin(resolvedSupabaseUrl, resolvedSupabaseKey), react(), mode === "development" && componentTagger()].filter(Boolean),
    define: {
      __HOBBEAST_BUILD__: JSON.stringify({
        version: releaseVersion,
        commitSha: buildCommitSha,
        timestamp: buildTimestamp,
      }),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Sprint 1.4: hand-picked chunk groups so heavy vendor libs are cached
      // separately from application code and admin/organizer routes don't
      // bloat the landing page bundle.
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "radix-ui": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-popover",
              "@radix-ui/react-select",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
            "supabase": ["@supabase/supabase-js"],
            "query": ["@tanstack/react-query"],
            "leaflet": ["leaflet"],
            "motion": ["framer-motion"],
            "forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
});
