import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reason } = await req.json();
    if (!reason) {
      return new Response(JSON.stringify({ error: "Reason is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Log deletion
    await adminClient.from("account_deletions").insert({
      user_id: user.id,
      email: user.email!,
      account_created_at: user.created_at,
      deletion_reason: reason,
    });

    // Delete user data
    await adminClient.from("event_participants").delete().eq("user_id", user.id);

    const { data: ownEvents } = await adminClient.from("events").select("id").eq("organizer_id", user.id);
    if (ownEvents && ownEvents.length > 0) {
      const eventIds = ownEvents.map((e) => e.id);
      await adminClient.from("event_participants").delete().in("event_id", eventIds);
      await adminClient.from("events").delete().in("id", eventIds);
    }

    // Delete avatar files
    const { data: avatarFiles } = await adminClient.storage.from("avatars").list(user.id);
    if (avatarFiles && avatarFiles.length > 0) {
      await adminClient.storage.from("avatars").remove(avatarFiles.map(f => `${user.id}/${f.name}`));
    }

    await adminClient.from("profiles").delete().eq("user_id", user.id);

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: "Failed to delete account" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("delete-account error:", message);
    return new Response(JSON.stringify({ error: message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
