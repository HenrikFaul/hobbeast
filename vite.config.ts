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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const resolvedSupabaseUrl = normalizeUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const resolvedSupabaseKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const resolvedProjectId = extractProjectRef(resolvedSupabaseUrl) || String(env.VITE_SUPABASE_PROJECT_ID || "").trim();

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    define: {
      __APP_SUPABASE_URL__: JSON.stringify(resolvedSupabaseUrl),
      __APP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(resolvedSupabaseKey),
      __APP_SUPABASE_PROJECT_ID__: JSON.stringify(resolvedProjectId),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@/integrations/supabase/client",
          replacement: path.resolve(__dirname, "./src/integrations/supabase/runtime-client.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
  };
});
