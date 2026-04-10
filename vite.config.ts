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
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(resolvedSupabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(resolvedSupabaseKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(resolvedProjectId),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
