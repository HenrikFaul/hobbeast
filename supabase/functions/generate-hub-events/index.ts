import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';
import { decorateVirtualHubsWithDemand } from '../shared/virtualHubEngine.ts';

interface HubRow {
  id: string;
  hobby_category: string;
  hobby_subcategory?: string | null;
  hobby_activity?: string | null;
  city: string | null;
  member_count: number;
  real_member_count: number;
  simulated_member_count: number;
  unknown_origin_member_count: number;
  demand_member_count: number;
  qualification_reasons: string[];
}

interface AutoEventConfig {
  id: string;
  enabled: boolean;
  min_members: number;
  max_distance_km: number;
  frequency_days: number;
  max_events_per_run: number;
  categories_filter: string[] | null;
}

interface QueryErrorShape {
  code?: string;
  message?: string;
}

interface GeneratedEventCandidate {
  hub_hobby: string;
  hub_city: string;
  title: string;
  description: string;
  category: string;
  event_date: string;
  event_time: string;
  location_city: string;
  location_free_text: string;
  max_attendees: number;
  image_emoji: string;
}

interface InsertedEvent {
  id: string;
  title: string;
}

interface AutoEventConfigUpdate {
  enabled: false;
  min_members: number;
  max_distance_km: number;
  frequency_days: number;
  max_events_per_run: number;
  categories_filter?: string[] | null;
}

// Event writes remain fail-closed until a reviewed DB migration provides a durable
// idempotency key, a transaction/job lock and duplicate-safe audit evidence.
const AUTO_EVENT_WRITES_AVAILABLE = false;

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isCategoryFilter(value: unknown): value is string[] | null {
  return value === null || (
    Array.isArray(value)
    && value.length <= 100
    && value.every((item) => isBoundedString(item, 120))
  );
}

function parseAutoEventConfigUpdate(value: unknown): AutoEventConfigUpdate | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.enabled !== false
    || !isIntegerInRange(candidate.min_members, 2, 100)
    || !isIntegerInRange(candidate.max_distance_km, 1, 200)
    || !isIntegerInRange(candidate.frequency_days, 1, 90)
    || !isIntegerInRange(candidate.max_events_per_run, 1, 50)
    || (candidate.categories_filter !== undefined && !isCategoryFilter(candidate.categories_filter))) {
    return null;
  }

  return {
    enabled: false,
    min_members: candidate.min_members,
    max_distance_km: candidate.max_distance_km,
    frequency_days: candidate.frequency_days,
    max_events_per_run: candidate.max_events_per_run,
    ...(candidate.categories_filter !== undefined
      ? { categories_filter: candidate.categories_filter as string[] | null }
      : {}),
  };
}

function isAutoEventConfig(value: unknown): value is AutoEventConfig {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.enabled === 'boolean'
    && isIntegerInRange(candidate.min_members, 2, 100)
    && isIntegerInRange(candidate.max_distance_km, 1, 200)
    && isIntegerInRange(candidate.frequency_days, 1, 90)
    && isIntegerInRange(candidate.max_events_per_run, 1, 50)
    && isCategoryFilter(candidate.categories_filter);
}

function toQueryError(error: unknown): QueryErrorShape {
  return typeof error === 'object' && error !== null ? error as QueryErrorShape : {};
}

function isMissingUserOriginColumn(error: unknown) {
  const shapedError = toQueryError(error);
  const message = String(shapedError.message || '');
  return shapedError.code === '42703'
    || shapedError.code === 'PGRST204'
    || (message.includes('user_origin') && /column|schema cache/i.test(message));
}

function isBoundedString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isGeneratedEventCandidate(value: unknown): value is GeneratedEventCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<GeneratedEventCandidate>;
  return isBoundedString(candidate.hub_hobby, 120)
    && isBoundedString(candidate.hub_city, 160)
    && isBoundedString(candidate.title, 120)
    && isBoundedString(candidate.description, 4000)
    && isBoundedString(candidate.category, 120)
    && typeof candidate.event_date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(candidate.event_date)
    && typeof candidate.event_time === 'string'
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.event_time)
    && isBoundedString(candidate.location_city, 160)
    && isBoundedString(candidate.location_free_text, 300)
    && Number.isInteger(candidate.max_attendees)
    && Number(candidate.max_attendees) >= 2
    && Number(candidate.max_attendees) <= 1000
    && isBoundedString(candidate.image_emoji, 16);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin(req);
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'preview';
    // Gateway JWT verification is disabled for historical compatibility, therefore every
    // action must pass the in-function admin boundary. Never trust a client body flag as a
    // scheduler identity. A future cron path needs a server-held signature + replay guard.
    const currentAdmin = await requireAdminUser(req, supabaseAdmin);

    const { data: configRows, error: configError } = await supabaseAdmin
      .from('auto_event_config')
      .select('*')
      .limit(1);

    if (configError) throw new Error(`Config load failed: ${configError.message}`);
    let config: AutoEventConfig | undefined;
    const storedConfig: unknown = configRows?.[0];
    if (storedConfig !== undefined) {
      if (!isAutoEventConfig(storedConfig)) {
        throw new Error('Stored auto-event configuration is outside the allowed contract.');
      }
      config = storedConfig;
    }

    if (!config) {
      const { data: insertedConfig, error: insertConfigError } = await supabaseAdmin
        .from('auto_event_config')
        .insert({
          enabled: false,
          min_members: 5,
          max_distance_km: 30,
          frequency_days: 7,
          max_events_per_run: 10,
          categories_filter: null,
        })
        .select('*')
        .single();

      if (insertConfigError) throw new Error(`Config bootstrap failed: ${insertConfigError.message}`);
      if (!isAutoEventConfig(insertedConfig)) {
        throw new Error('Bootstrapped auto-event configuration is outside the allowed contract.');
      }
      config = insertedConfig;
    }

    if (action === 'get_config') {
      return jsonResponse({ config });
    }

    if (action === 'save_config') {
      const updates = parseAutoEventConfigUpdate(body.config);
      if (!updates) {
        return jsonResponse({
          error: 'Invalid auto-event configuration. Scheduling must remain disabled and all limits must be in range.',
          code: 'INVALID_AUTO_EVENT_CONFIG',
        }, 400);
      }
      const { error: updateError } = await supabaseAdmin
        .from('auto_event_config')
        .update(updates)
        .eq('id', config.id);
      if (updateError) throw new Error(`Config save failed: ${updateError.message}`);
      return jsonResponse({ ok: true });
    }

    // Load hub membership demand. `member_count` is the legacy total and can include
    // generated users, so it must never be the production-demand qualification metric.
    let hubQuery = supabaseAdmin
      .from('virtual_hubs')
      .select('id, hobby_category, hobby_subcategory, hobby_activity, city, member_count')
      .order('member_count', { ascending: false });

    if (config.categories_filter && config.categories_filter.length > 0) {
      hubQuery = hubQuery.in('hobby_category', config.categories_filter);
    }

    const { data: hubs, error: hubError } = await hubQuery.limit(1000);
    if (hubError) throw new Error(`Hub query failed: ${hubError.message}`);

    const hubIds = (hubs || []).map((hub) => hub.id);
    let memberships: Array<{ hub_id: string; user_id: string }> = [];
    let profiles: Array<{ user_id: string; user_origin: 'real' | 'generated' | null }> = [];

    if (hubIds.length > 0) {
      const { data: membershipRows, error: membershipError } = await supabaseAdmin
        .from('virtual_hub_members')
        .select('hub_id, user_id')
        .in('hub_id', hubIds);
      if (membershipError) throw new Error(`Hub membership load failed: ${membershipError.message}`);
      memberships = membershipRows || [];

      const userIds = [...new Set(memberships.map((row) => row.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('user_id, user_origin')
          .in('user_id', userIds);
        if (profileError && isMissingUserOriginColumn(profileError)) {
          return jsonResponse({
            error: 'The profiles.user_origin discriminator is not available; real demand cannot be separated from simulated demand.',
            code: 'HUB_USER_ORIGIN_SCHEMA_REQUIRED',
          }, 409);
        }
        if (profileError) throw new Error(`Hub member origin load failed: ${profileError.message}`);
        profiles = profileRows || [];
      }
    }

    const qualifiedDemand = decorateVirtualHubsWithDemand(
      hubs || [],
      memberships,
      profiles,
      config.min_members,
    );
    const qualifyingHubs = qualifiedDemand
      .filter((hub) => hub.qualification_status === 'qualified')
      .sort((left, right) => right.real_member_count - left.real_member_count)
      .slice(0, config.max_events_per_run * 2) as HubRow[];

    if (action === 'preview') {
      return jsonResponse({
        qualifying_hubs: qualifyingHubs.length,
        hubs: qualifyingHubs.slice(0, 20).map((h) => ({
          hobby: h.hobby_category,
          city: h.city,
          members: h.real_member_count,
          real_members: h.real_member_count,
          simulated_members: h.simulated_member_count,
          unknown_origin_members: h.unknown_origin_member_count,
          qualification_reasons: h.qualification_reasons,
        })),
        config,
      });
    }

    if (action === 'generate' && !AUTO_EVENT_WRITES_AVAILABLE) {
      return jsonResponse({
        error: 'Event generation writes are blocked until durable idempotency and job locking are deployed.',
        code: 'HUB_AUTO_EVENT_IDEMPOTENCY_REQUIRED',
      }, 409);
    }

    if (action === 'generate') {
      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured. Cannot generate events with AI.');
      }

      if (qualifyingHubs.length === 0) {
        return jsonResponse({ ok: true, generated: 0, message: 'No qualifying hubs found.' });
      }

      // Build prompt for AI
      const hubDescriptions = qualifyingHubs.slice(0, config.max_events_per_run).map((h) => 
        `- "${h.hobby_category}" hobby, ${h.city || 'ismeretlen város'} város, ${h.real_member_count} valódi érdeklődő tag`
      ).join('\n');

      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

      const prompt = `Te egy magyar szabadidős eseményszervező AI vagy. A következő virtuális közösségek (hubók) alapján generálj eseményjavaslatokat. Minden hub egy hobbit és egy várost képvisel, ahol elegendő érdeklődő van.

Hubók:
${hubDescriptions}

Szabályok:
- Generálj pontosan ${Math.min(qualifyingHubs.length, config.max_events_per_run)} eseményt, egyenként egy-egy hubhoz.
- Az esemény dátuma legyen ${nextWeek.toISOString().split('T')[0]} és ${twoWeeks.toISOString().split('T')[0]} között.
- Az időpont legyen tipikusan délután vagy este (14:00-20:00).
- A cím legyen vonzó, magyar nyelvű, max 60 karakter.
- A leírás legyen barátságos, motiváló, 2-3 mondat, magyarul.
- A helyszín legyen a hub városában egy tipikus helyszín az adott hobbihoz.
- A max_attendees legyen az adott hobbihoz igazodó (csapatsportok: 10-30, társasjáték: 4-8, túra: 10-20, stb).

Válaszolj KIZÁRÓLAG egy JSON tömbbel, más szöveget ne írj. Formátum:
[
  {
    "hub_hobby": "hobbi neve",
    "hub_city": "város",
    "title": "Esemény címe",
    "description": "Esemény leírása",
    "category": "Kategória",
    "event_date": "YYYY-MM-DD",
    "event_time": "HH:MM",
    "location_city": "Város",
    "location_free_text": "Helyszín",
    "max_attendees": 15,
    "image_emoji": "🎯"
  }
]`;

      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'Te egy professzionális magyar szabadidős eseményszervező AI vagy. KIZÁRÓLAG az előírt sémának megfelelő JSON-t add vissza.' }],
            },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    hub_hobby: { type: 'STRING' },
                    hub_city: { type: 'STRING' },
                    title: { type: 'STRING' },
                    description: { type: 'STRING' },
                    category: { type: 'STRING' },
                    event_date: { type: 'STRING' },
                    event_time: { type: 'STRING' },
                    location_city: { type: 'STRING' },
                    location_free_text: { type: 'STRING' },
                    max_attendees: { type: 'INTEGER' },
                    image_emoji: { type: 'STRING' },
                  },
                  required: ['hub_hobby', 'hub_city', 'title', 'description', 'category', 'event_date', 'event_time', 'location_city', 'location_free_text', 'max_attendees', 'image_emoji'],
                },
              },
            },
          }),
        }
      );

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`AI API error ${aiResponse.status}: ${errText.slice(0, 500)}`);
      }

      const aiData = await aiResponse.json();
      const rawContent = (aiData.candidates?.[0]?.content?.parts?.[0]?.text) || '';

      let events: GeneratedEventCandidate[];
      try {
        const parsed: unknown = JSON.parse(rawContent.trim());
        if (!Array.isArray(parsed) || !parsed.every(isGeneratedEventCandidate)) {
          throw new Error('AI response does not match the generated-event contract.');
        }
        events = parsed;
      } catch (err) {
        throw new Error(`AI response was not valid JSON: ${rawContent.slice(0, 200)} | Error: ${err}`);
      }

      const createdBy = currentAdmin.id;
      if (!createdBy) throw new Error('No admin user found to assign as event creator.');

      const insertedEvents: InsertedEvent[] = [];
      const errors: string[] = [];

      for (const evt of events.slice(0, config.max_events_per_run)) {
        try {
          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('events')
            .insert({
              title: evt.title,
              description: `${evt.description}\n\n🤖 Ez az esemény AI alapján lett generálva a közösségi érdeklődés alapján.`,
              category: evt.category || evt.hub_hobby,
              event_date: evt.event_date,
              event_time: evt.event_time,
              location_city: evt.location_city || evt.hub_city,
              location_free_text: evt.location_free_text,
              max_attendees: evt.max_attendees || 15,
              image_emoji: evt.image_emoji || '🎯',
              created_by: createdBy,
              is_active: true,
              visibility_type: 'public',
              participation_type: 'open',
            })
            .select('id, title')
            .maybeSingle(); // <-- A KULCS: .single() lecserélése .maybeSingle()-re

          if (insertError) {
            errors.push(`${evt.title}: ${insertError.message}`);
          } else if (!inserted) {
            // Ha a DB csendben blokkolta az insertet vagy nem olvasható vissza (pl. trigger, duplikáció vagy RLS miatt)
            errors.push(`${evt.title}: Mentés elutasítva (valószínűleg duplikáció vagy adatbázis trigger blokkolta).`);
          } else {
            insertedEvents.push(inserted);
          }
        } catch (e) {
          errors.push(`${evt.title}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Update last run
      const { error: auditUpdateError } = await supabaseAdmin
        .from('auto_event_config')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_result: {
            generated: insertedEvents.length,
            errors: errors.length,
            error_details: errors,
            event_ids: insertedEvents.map((e) => e.id),
          },
        })
        .eq('id', config.id);
      if (auditUpdateError) {
        throw new Error(`Last-run audit update failed: ${auditUpdateError.message}`);
      }

      return jsonResponse({
        ok: true,
        generated: insertedEvents.length,
        errors: errors.length,
        error_details: errors,
        events: insertedEvents,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const unauthorized = message === 'Missing authorization token.' || message.startsWith('Unauthorized request:');
    const forbidden = message === 'Admin access required.';
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    const status = unauthorized ? 401 : forbidden ? 403 : timedOut ? 504 : 500;
    if (status >= 500) console.error('generate-hub-events error:', error);
    return jsonResponse({
      error: status >= 500 ? (timedOut ? 'AI provider timed out.' : message) : status === 401 ? 'Unauthorized.' : 'Admin access required.',
      code: status === 401
        ? 'UNAUTHORIZED'
        : status === 403
          ? 'ADMIN_REQUIRED'
          : timedOut
            ? 'AI_PROVIDER_TIMEOUT'
            : 'INTERNAL_ERROR',
    }, status);
  }
});
