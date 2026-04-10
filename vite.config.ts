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

function createSupabaseClientOverridePlugin(supabaseUrl: string, supabaseKey: string) {
  return {
    name: "supabase-client-override",
    enforce: "pre" as const,
    load(id: string) {
      const normalizedId = id.replace(/\\/g, "/");
      if (!normalizedId.endsWith("/src/integrations/supabase/client.ts")) return null;

      return `import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(supabaseKey)};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
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

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [createSupabaseClientOverridePlugin(resolvedSupabaseUrl, resolvedSupabaseKey), react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
