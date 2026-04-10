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
  hobbies: string[];
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

function normalizeHobbies(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const maybe = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).label;
        return typeof maybe === "string" ? maybe.trim() : "";
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
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

    // Check admin role
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { users } = await req.json() as { users: GeneratedUser[] };
    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "No users provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const BATCH_SIZE = 50;
    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      for (const u of batch) {
        const email = `test-${crypto.randomUUID()}@example.com`;
        const password = `TestUser_${Math.random().toString(36).slice(2, 14)}!`;

        // Create auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: u.display_name, is_test_user: true },
        });

        if (authError || !authUser.user) {
          errors.push(`${u.display_name}: ${authError?.message || "unknown"}`);
          continue;
        }

        created += 1;

        // Calculate date of birth from age
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - u.age);
        const dobStr = dob.toISOString().split("T")[0];
        const normalizedHobbies = normalizeHobbies(u.hobbies);
        const normalizedGender = normalizeGender(u.gender);

        const profilePayload = {
          id: authUser.user.id,
          user_id: authUser.user.id,
          display_name: u.display_name,
          city: u.city,
          location_lat: u.lat,
          location_lon: u.lon,
          hobbies: normalizedHobbies,
          gender: normalizedGender,
          date_of_birth: dobStr,
          bio: u.bio,
        };

        let profileError: { message: string } | null = null;

        // First try the current schema style (existing trigger-created row keyed by id).
        {
          const { error } = await supabaseAdmin
            .from("profiles")
            .upsert(profilePayload, { onConflict: "id" });
          profileError = error ? { message: error.message } : null;
        }

        // Fallback for older schema variants keyed by user_id.
        if (profileError) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .upsert(profilePayload, { onConflict: "user_id" });
          profileError = error ? { message: error.message } : null;
        }

        // Final fallback: update in place in case the trigger already created a sparse row.
        if (profileError) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({
              display_name: u.display_name,
              city: u.city,
              location_lat: u.lat,
              location_lon: u.lon,
              hobbies: normalizedHobbies,
              gender: normalizedGender,
              date_of_birth: dobStr,
              bio: u.bio,
            })
            .eq("id", authUser.user.id);
          profileError = error ? { message: error.message } : null;
        }

        if (profileError) {
          errors.push(`${u.display_name} profile: ${profileError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ created, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
