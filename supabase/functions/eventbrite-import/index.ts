import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVENTBRITE_BASE = 'https://www.eventbriteapi.com/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const EVENTBRITE_TOKEN = Deno.env.get('EVENTBRITE_API_KEY');
  if (!EVENTBRITE_TOKEN) {
    return new Response(JSON.stringify({ error: 'EVENTBRITE_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const headers = {
    'Authorization': `Bearer ${EVENTBRITE_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    const { action, organization_id, keyword, page } = await req.json();

    // Action: list_organizations – get user's orgs to find org IDs
    if (action === 'list_organizations') {
      const res = await fetch(`${EVENTBRITE_BASE}/users/me/organizations/`, { headers });
      if (!res.ok) throw new Error(`Eventbrite API error [${res.status}]: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: list_events – list events for a specific organization
    if (action === 'list_events') {
      if (!organization_id) {
        return new Response(JSON.stringify({ error: 'organization_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const params = new URLSearchParams({
        status: 'live',
        order_by: 'start_asc',
        expand: 'venue,category',
      });
      if (page) params.set('page', String(page));

      const res = await fetch(
        `${EVENTBRITE_BASE}/organizations/${organization_id}/events/?${params}`,
        { headers }
      );
      if (!res.ok) throw new Error(`Eventbrite API error [${res.status}]: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: search_events – search via destination endpoint (if available) or keyword filter
    if (action === 'search_events') {
      // Use the destination events search endpoint
      const params = new URLSearchParams();
      if (keyword) params.set('q', keyword);
      if (page) params.set('page', String(page));
      params.set('expand', 'venue,category');

      // Try destination search endpoint first
      const res = await fetch(
        `${EVENTBRITE_BASE}/destination/search/?${params}`,
        { headers }
      );

      // If destination search is not available, fall back to org events
      if (!res.ok) {
        // Fallback: get user's first org events
        const orgRes = await fetch(`${EVENTBRITE_BASE}/users/me/organizations/`, { headers });
        if (!orgRes.ok) throw new Error(`Eventbrite API error [${orgRes.status}]: ${await orgRes.text()}`);
        const orgData = await orgRes.json();

        if (orgData.organizations?.length > 0) {
          const orgId = orgData.organizations[0].id;
          const fallbackParams = new URLSearchParams({
            status: 'live',
            order_by: 'start_asc',
            expand: 'venue,category',
          });
          if (keyword) fallbackParams.set('name_filter', keyword);
          if (page) fallbackParams.set('page', String(page));

          const evRes = await fetch(
            `${EVENTBRITE_BASE}/organizations/${orgId}/events/?${fallbackParams}`,
            { headers }
          );
          if (!evRes.ok) throw new Error(`Eventbrite API error [${evRes.status}]: ${await evRes.text()}`);
          const evData = await evRes.json();
          return new Response(JSON.stringify(evData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ events: [], pagination: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: get_event – get single event details
    if (action === 'get_event') {
      const { event_id } = await req.json().catch(() => ({}));
      if (!event_id) {
        return new Response(JSON.stringify({ error: 'event_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(
        `${EVENTBRITE_BASE}/events/${event_id}/?expand=venue,category,ticket_classes`,
        { headers }
      );
      if (!res.ok) throw new Error(`Eventbrite API error [${res.status}]: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: list_organizations, list_events, search_events, get_event' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Eventbrite import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
