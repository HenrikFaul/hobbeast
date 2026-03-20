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
    const { action, organization_id, keyword, page, location } = await req.json();

    // Action: list_organizations
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

    // Action: search_events – use events search endpoint
    if (action === 'search_events') {
      const params = new URLSearchParams();
      if (keyword) params.set('q', keyword);
      if (page) params.set('page', String(page));
      params.set('expand', 'venue,category');
      
      // Location-based search
      const loc = location || 'Budapest';
      params.set('location.address', loc);
      params.set('location.within', '50km');

      // Use the events search endpoint (v3)
      const searchUrl = `${EVENTBRITE_BASE}/events/search/?${params}`;
      console.log('Eventbrite search URL:', searchUrl);
      
      const res = await fetch(searchUrl, { headers });
      
      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If search endpoint fails, try destination events
      console.log('Search endpoint failed, trying destination...');
      const destParams = new URLSearchParams();
      if (keyword) destParams.set('q', keyword);
      if (page) destParams.set('page', String(page));
      destParams.set('expand', 'venue,category');
      
      const destRes = await fetch(
        `${EVENTBRITE_BASE}/destination/events/?${destParams}`,
        { headers }
      );
      
      if (destRes.ok) {
        const data = await destRes.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Final fallback: return empty
      console.log('All Eventbrite search methods failed. Status:', res.status, destRes.status);
      const errText = await res.text().catch(() => '');
      console.log('Search error body:', errText);
      
      return new Response(JSON.stringify({ 
        events: [], 
        pagination: { object_count: 0, page_number: 1, page_size: 50, page_count: 0, has_more_items: false },
        _debug: `Search returned ${res.status}` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: list_organizations, list_events, search_events' }), {
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
