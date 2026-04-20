import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAdminUser } from '../shared/adminAuth.ts';

interface HubRow {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = getSupabaseAdmin(req);
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'preview';
    const isCron = body._cron === true;

    let currentAdmin: { id: string } | null = null;
    if (isCron && action === 'generate') {
      const { data: adminRole, error: adminRoleError } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (adminRoleError) throw new Error(`Admin role load failed: ${adminRoleError.message}`);
      if (!adminRole?.user_id) throw new Error('No admin user found for cron execution.');
      currentAdmin = { id: adminRole.user_id };
    } else {
      currentAdmin = await requireAdminUser(req, supabaseAdmin);
    }

    const { data: configRows, error: configError } = await supabaseAdmin
      .from('auto_event_config')
      .select('*')
      .limit(1);

    if (configError) throw new Error(`Config load failed: ${configError.message}`);
    let config = configRows?.[0] as AutoEventConfig | undefined;

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
      config = insertedConfig as AutoEventConfig;
    }

    if (action === 'get_config') {
      return jsonResponse({ config });
    }

    if (action === 'save_config') {
      const updates = body.config || {};
      const { error: updateError } = await supabaseAdmin
        .from('auto_event_config')
        .update(updates)
        .eq('id', config.id);
      if (updateError) throw new Error(`Config save failed: ${updateError.message}`);
      return jsonResponse({ ok: true });
    }

    // Load qualifying hubs
    let hubQuery = supabaseAdmin
      .from('virtual_hubs')
      .select('*')
      .gte('member_count', config.min_members)
      .order('member_count', { ascending: false });

    if (config.categories_filter && config.categories_filter.length > 0) {
      hubQuery = hubQuery.in('hobby_category', config.categories_filter);
    }

    const { data: hubs, error: hubError } = await hubQuery.limit(config.max_events_per_run * 2);
    if (hubError) throw new Error(`Hub query failed: ${hubError.message}`);

    const qualifyingHubs = (hubs || []) as HubRow[];

    if (action === 'preview') {
      return jsonResponse({
        qualifying_hubs: qualifyingHubs.length,
        hubs: qualifyingHubs.slice(0, 20).map((h) => ({
          hobby: h.hobby_category,
          city: h.city,
          members: h.member_count,
        })),
        config,
      });
    }

    if (action === 'generate') {
      // Cron calls respect the enabled flag
      if (isCron && !config.enabled) {
        return jsonResponse({ ok: true, generated: 0, message: 'Auto-generation is disabled.' });
      }

      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured. Cannot generate events with AI.');
      }

      if (qualifyingHubs.length === 0) {
        return jsonResponse({ ok: true, generated: 0, message: 'No qualifying hubs found.' });
      }

      // Check team-based activities from hobby catalog
      const { data: activities } = await supabaseAdmin
        .from('hobby_activities')
        .select('name, slug, emoji, is_team_based, group_size_min, group_size_max, subcategory:hobby_subcategories(name, category:hobby_categories(name))')
        .eq('is_active', true);

      const activityMap = new Map<string, any>();
      for (const act of (activities || [])) {
        activityMap.set(act.name?.toLowerCase(), act);
      }

      // Build prompt for AI
      const hubDescriptions = qualifyingHubs.slice(0, config.max_events_per_run).map((h) => 
        `- "${h.hobby_category}" hobby, ${h.city || 'országos'} város, ${h.member_count} érdeklődő tag`
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
        throw new Error(`AI API error ${aiResponse.status}: ${errText}`);
      }

      const aiData = await aiResponse.json();
      const rawContent = (aiData.candidates?.[0]?.content?.parts?.[0]?.text) || '';

      let events: any[];
      try {
        let jsonStr = rawContent.trim();

        // Ha a válasz tömbként indul, de nem úgy fejeződik be (csonkolódott)
        if (jsonStr.startsWith('[') && !jsonStr.endsWith(']')) {
          // Megkeressük az utolsó sikeresen lezárt objektum végét
          const lastValidBrace = jsonStr.lastIndexOf('}');

          if (lastValidBrace !== -1) {
            // Levágjuk a csonka részt, és szabályosan lezárjuk a tömböt
            jsonStr = jsonStr.substring(0, lastValidBrace + 1) + ']';
          } else {
            // Ha egyetlen objektum sem jött létre sikeresen
            jsonStr = '[]';
          }
        }

        events = JSON.parse(jsonStr);
      } catch (err) {
        throw new Error(`AI response was not valid JSON: ${rawContent.slice(0, 200)} | Error: ${err}`);
      }

      if (!Array.isArray(events)) throw new Error('AI response is not an array.');

      const createdBy = currentAdmin.id;
      if (!createdBy) throw new Error('No admin user found to assign as event creator.');

      const insertedEvents: any[] = [];
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
      await supabaseAdmin
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
    console.error('generate-hub-events error:', error);
    return jsonResponse({ error: message }, 500);
  }
});
