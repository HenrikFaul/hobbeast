import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const extractSupabaseProjectId = (url?: string) => {
  if (!url) return "";

  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
  return match?.[1] ?? "";
};

const forceSupabaseClientTarget = (url: string, publishableKey: string) => ({
  name: "force-supabase-client-target",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith("/src/integrations/supabase/client.ts")) return null;

    return code
      .replace(
        'const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;',
        `const SUPABASE_URL = ${JSON.stringify(url)};`
      )
      .replace(
        'const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;',
        `const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};`
      );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const resolvedSupabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const resolvedSupabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const resolvedSupabaseProjectId =
    extractSupabaseProjectId(resolvedSupabaseUrl) || env.SUPABASE_PROJECT_ID || env.VITE_SUPABASE_PROJECT_ID || "";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      forceSupabaseClientTarget(resolvedSupabaseUrl, resolvedSupabasePublishableKey),
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(resolvedSupabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(resolvedSupabasePublishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(resolvedSupabaseProjectId),
    },
  };
});
