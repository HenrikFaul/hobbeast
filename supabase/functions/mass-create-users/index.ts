import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
        const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hobbeast-test.local`;
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

        // Calculate date of birth from age
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - u.age);
        const dobStr = dob.toISOString().split("T")[0];

        // Create profile
        const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
          user_id: authUser.user.id,
          display_name: u.display_name,
          city: u.city,
          location_lat: u.lat,
          location_lon: u.lon,
          hobbies: u.hobbies,
          gender: u.gender,
          date_of_birth: dobStr,
          bio: u.bio,
        }, { onConflict: "user_id" });

        if (profileError) {
          errors.push(`${u.display_name} profile: ${profileError.message}`);
        } else {
          created++;
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
