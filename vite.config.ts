import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function normalizeUrl(value?: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractProjectRef(url?: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.split(".")[0] || "";
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
  const resolvedSupabaseUrl = normalizeUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const resolvedSupabaseKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const resolvedProjectId = extractProjectRef(resolvedSupabaseUrl) || String(env.SUPABASE_PROJECT_ID || env.VITE_SUPABASE_PROJECT_ID || "").trim();

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
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
