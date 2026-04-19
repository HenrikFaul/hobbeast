import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const ALLOWED_GENDERS = new Set(['male', 'female', 'other', 'prefer_not_to_say']);

async function ensureAdmin(req: Request, supabaseUrl: string, adminClient: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await (adminClient as any).rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (error || !isAdmin) return null;
  return user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const caller = await ensureAdmin(req, supabaseUrl, adminClient);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { userId, gender, isActive, bio, hobbies, eventIds } = await req.json() as {
      userId: string;
      gender?: string | null;
      isActive?: boolean;
      bio?: string | null;
      hobbies?: string[];
      eventIds?: string[];
    };

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sanitizedGender = !gender ? null : String(gender).trim();
    if (sanitizedGender && !ALLOWED_GENDERS.has(sanitizedGender)) {
      return new Response(JSON.stringify({ error: 'Invalid gender value' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sanitizedBio = typeof bio === 'string' ? bio.trim().slice(0, 500) : null;
    const sanitizedHobbies = Array.isArray(hobbies)
      ? Array.from(new Set(hobbies.map((row) => String(row).trim()).filter(Boolean)))
      : [];
    const requestedEventIds = Array.isArray(eventIds)
      ? Array.from(new Set(eventIds.map((row) => String(row).trim()).filter(Boolean)))
      : [];

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        gender: sanitizedGender,
        is_active: isActive !== false,
        bio: sanitizedBio,
        hobbies: sanitizedHobbies,
      })
      .eq('user_id', userId);
    if (profileError) throw profileError;

    const { data: existingRows, error: existingError } = await adminClient
      .from('event_participants')
      .select('id, event_id')
      .eq('user_id', userId);
    if (existingError) throw existingError;

    const existingEventIds = new Set((existingRows || []).map((row: any) => row.event_id).filter(Boolean));
    const requestedSet = new Set(requestedEventIds);
    const rowsToDelete = (existingRows || []).filter((row: any) => !requestedSet.has(row.event_id)).map((row: any) => row.id);

    if (rowsToDelete.length > 0) {
      const { error: deleteError } = await adminClient
        .from('event_participants')
        .delete()
        .in('id', rowsToDelete);
      if (deleteError) throw deleteError;
    }

    const toInsert = requestedEventIds.filter((id) => !existingEventIds.has(id));
    if (toInsert.length > 0) {
      const payload = toInsert.map((eventId) => ({
        user_id: userId,
        event_id: eventId,
        status: 'going',
        participation_type: 'admin_manual',
      }));
      const { error: insertError } = await adminClient
        .from('event_participants')
        .insert(payload);
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ ok: true, eventCount: requestedEventIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
