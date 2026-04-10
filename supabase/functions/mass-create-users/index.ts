// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseAdmin, resolveInternalSupabaseUrl } from "../shared/providerFetch.ts";

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

type AdminClient = any;

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
        const record = item as Record<string, unknown>;
        const candidate = record.name ?? record.label;
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

async function ensureAdmin(req: Request, supabaseUrl: string, supabaseAdmin: AdminClient) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return null;

  const { data: isAdmin, error } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (error || !isAdmin) return null;
  return user;
}

function isMissingColumnError(error: any, columns: string[]) {
  const message = String(error?.message || error?.details || '');
  return columns.some((column) => message.includes(column));
}

async function persistProfile(supabaseAdmin: AdminClient, authUserId: string, u: GeneratedUser, dobStr: string) {
  const basePayload = {
    display_name: u.display_name,
    city: u.city,
    location_lat: u.lat,
    location_lon: u.lon,
    hobbies: normalizeHobbies(u.hobbies),
    gender: normalizeGender(u.gender),
    date_of_birth: dobStr,
    bio: u.bio,
    updated_at: new Date().toISOString(),
  };

  const extendedPayload = {
    ...basePayload,
    user_origin: 'generated',
    is_active: true,
  };

  const existing = await supabaseAdmin
    .from('profiles')
    .select('id,user_id')
    .eq('user_id', authUserId)
    .maybeSingle();

  if (existing.error) return existing.error;

  const saveProfile = async (payload: Record<string, unknown>) => {
    if (existing.data) {
      const updateResult = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('user_id', authUserId);
      return updateResult.error;
    }

    const insertResult = await supabaseAdmin
      .from('profiles')
      .insert({ id: authUserId, user_id: authUserId, ...payload });

    return insertResult.error;
  };

  let profileError = await saveProfile(extendedPayload);
  if (profileError && isMissingColumnError(profileError, ['user_origin', 'is_active'])) {
    profileError = await saveProfile(basePayload);
  }

  return profileError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = resolveInternalSupabaseUrl(req);
    const supabaseAdmin = getSupabaseAdmin(req);

    const caller = await ensureAdmin(req, supabaseUrl, supabaseAdmin);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { users } = await req.json() as { users: GeneratedUser[] };
    if (!users || !Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "No users provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    const errors: string[] = [];
    const profileErrors: string[] = [];

    for (const u of users) {
      const email = `test-${crypto.randomUUID()}@example.com`;
      const password = `TestUser_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}!`;

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: u.display_name, is_test_user: true, user_origin: 'generated', is_active: true },
      });

      if (authError || !authUser.user) {
        errors.push(`${u.display_name}: ${authError?.message || 'unknown auth error'}`);
        continue;
      }

      created += 1;

      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - Number(u.age || 18));
      const dobStr = dob.toISOString().split('T')[0];

      const profileError = await persistProfile(supabaseAdmin, authUser.user.id, u, dobStr);
      if (profileError) {
        profileErrors.push(`${u.display_name} profile: ${profileError.message}`);
      }
    }

    return new Response(JSON.stringify({ created, profileErrors, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
