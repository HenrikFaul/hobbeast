import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { env } from "@/lib/env";
import { assertTargetProject } from "@/lib/supabaseProjects";

// v1.7.6: boot-time multi-Supabase project assertion. Logs a name-only
// warning if the frontend is bound to the wrong project. Never blocks
// startup and never logs keys or full URLs beyond the project ref.
const projectCheck = assertTargetProject(env?.VITE_SUPABASE_URL);
if (!projectCheck.ok) {
  // eslint-disable-next-line no-console
  console.warn("[supabase-projects]", projectCheck.message, { ref: projectCheck.ref, role: projectCheck.role });
}

createRoot(document.getElementById("root")!).render(<App />);
