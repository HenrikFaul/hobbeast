import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const VIRTUAL_SUPABASE_CLIENT_ID = "\0virtual:app-supabase-client";

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

function createSupabaseClientVirtualPlugin(supabaseUrl: string, supabaseKey: string) {
  return {
    name: "virtual-supabase-client",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === "@/integrations/supabase/client") {
        return VIRTUAL_SUPABASE_CLIENT_ID;
      }
      return null;
    },
    load(id: string) {
      if (id !== VIRTUAL_SUPABASE_CLIENT_ID) return null;

      return `import { createClient } from '@supabase/supabase-js';
import type { Database } from '/src/integrations/supabase/types.ts';

export const supabase = createClient<Database>(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(supabaseKey)}, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
`;
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
    plugins: [createSupabaseClientVirtualPlugin(resolvedSupabaseUrl, resolvedSupabaseKey), react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
