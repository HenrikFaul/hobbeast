import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface GeneratedUser {
  display_name: string;
  city: string;
  lat: number;
  lon: number;
  hobbies: unknown[];
  gender: string;
  age: number;
  bio: string;
}

function normalizeGender(value: string): string {
  const v = String(value || "").trim().toLowerCase();
  if (v === "férfi" || v === "ferfi" || v === "male") return "male";
  if (v === "nő" || v === "no" || v === "female") return "female";
  if (v === "other") return "other";
  return "prefer_not_to_say";
}

function normalizeHobbies(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const candidate = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).label;
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

async function upsertProfile(supabaseAdmin: ReturnType<typeof createClient>, authUserId: string, u: GeneratedUser, dobStr: string) {
  const payload = {
    id: authUserId,
    user_id: authUserId,
    display_name: u.display_name,
    city: u.city,
    location_lat: u.lat,
    location_lon: u.lon,
    hobbies: normalizeHobbies(u.hobbies),
    gender: normalizeGender(u.gender),
    date_of_birth: dobStr,
    bio: u.bio,
    user_origin: 'generated',
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (!error) return null;

  const retry = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
  if (!retry.error) return null;

  const fallback = await supabaseAdmin.from("profiles").update(payload).eq("user_id", authUserId);
  return fallback.error ?? retry.error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (roleError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { users } = await req.json() as { users: GeneratedUser[] };
    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "No users provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let created = 0;
    const errors: string[] = [];

    for (const u of users) {
      const email = `generated-${crypto.randomUUID()}@example.com`;
      const password = `TestUser_${crypto.randomUUID().slice(0, 12)}!`;

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: u.display_name,
          is_test_user: true,
          generated_user: true,
        },
      });

      if (authError || !authUser.user) {
        errors.push(`${u.display_name}: ${authError?.message || "auth create failed"}`);
        continue;
      }

      created += 1;

      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - u.age);
      const dobStr = dob.toISOString().split("T")[0];

      const profileError = await upsertProfile(supabaseAdmin, authUser.user.id, u, dobStr);
      if (profileError) {
        errors.push(`${u.display_name} profile: ${profileError.message}`);
      }
    }

    return new Response(JSON.stringify({ created, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
