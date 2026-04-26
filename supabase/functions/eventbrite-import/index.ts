import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const EVENTBRITE_BASE = 'https://www.eventbriteapi.com/v3';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getEventbriteToken() {
  return Deno.env.get('EVENTBRITE_PRIVATE_TOKEN')
    || Deno.env.get('EVENTBRITE_TOKEN')
    || Deno.env.get('EVENTBRITE_API_KEY');
}

function getEventbriteConfig() {
  return {
    apiKey: Deno.env.get('EVENTBRITE_API_KEY') || null,
    clientSecret: Deno.env.get('EVENTBRITE_CLIENT_SECRET') || null,
    publicToken: Deno.env.get('EVENTBRITE_PUBLIC_TOKEN') || null,
    webhookId: Deno.env.get('EVENTBRITE_WEBHOOK_ID') || null,
  };
}

async function fetchEventbrite(path: string, headers: Record<string, string>) {
  const res = await fetch(`${EVENTBRITE_BASE}${path}`, { headers });
  return res;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const token = getEventbriteToken();
  if (!token) {
    return jsonResponse({ error: 'Eventbrite token is not configured. Set EVENTBRITE_API_KEY, EVENTBRITE_TOKEN or EVENTBRITE_PRIVATE_TOKEN.' }, 500);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    const { action, organization_id, keyword, page, location } = await req.json();
    const config = getEventbriteConfig();


    if (action === 'validate_token') {
      const res = await fetchEventbrite('/users/me/organizations/', headers);
      const bodyText = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(bodyText); } catch (_) {}
      return jsonResponse({
        ok: res.ok,
        status: res.status,
        config: {
          has_api_key: Boolean(config.apiKey),
          has_client_secret: Boolean(config.clientSecret),
          has_private_token: Boolean(token),
          has_public_token: Boolean(config.publicToken),
          webhook_id: config.webhookId,
        },
        response: parsed ?? bodyText,
      }, res.ok ? 200 : res.status);
    }

    if (action === 'list_organizations') {
      const res = await fetchEventbrite('/users/me/organizations/', headers);
      if (!res.ok) throw new Error(`Eventbrite API error [${res.status}]: ${await res.text()}`);
      return jsonResponse(await res.json());
    }

    if (action === 'list_events') {
      if (!organization_id) {
        return jsonResponse({ error: 'organization_id is required' }, 400);
      }

      const params = new URLSearchParams({
        status: 'live',
        order_by: 'start_asc',
        expand: 'venue,category',
      });
      if (page) params.set('page', String(page));

      const res = await fetchEventbrite(`/organizations/${organization_id}/events/?${params.toString()}`, headers);
      if (!res.ok) throw new Error(`Eventbrite API error [${res.status}]: ${await res.text()}`);
      return jsonResponse(await res.json());
    }

    if (action === 'search_events') {
      const locationValue = location || 'Budapest';
      const searchParams = new URLSearchParams({
        expand: 'venue,category',
        sort_by: 'date',
        'location.address': locationValue,
        'location.within': '50km',
      });
      if (keyword) searchParams.set('q', keyword);
      if (page) searchParams.set('page', String(page));

      const searchRes = await fetchEventbrite(`/events/search/?${searchParams.toString()}`, headers);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if ((searchData.events || []).length > 0) {
          return jsonResponse(searchData);
        }
      }

      try {
        const orgRes = await fetchEventbrite('/users/me/organizations/', headers);
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          const organizations = orgData.organizations || [];
          for (const org of organizations) {
            const orgParams = new URLSearchParams({
              status: 'live',
              order_by: 'start_asc',
              expand: 'venue,category',
            });
            if (page) orgParams.set('page', String(page));
            const orgEventsRes = await fetchEventbrite(`/organizations/${org.id}/events/?${orgParams.toString()}`, headers);
            if (orgEventsRes.ok) {
              const orgEventsData = await orgEventsRes.json();
              if ((orgEventsData.events || []).length > 0) {
                return jsonResponse(orgEventsData);
              }
            }
          }
        }
      } catch (error) {
        console.error('Organization fallback failed', error);
      }

      const destinationParams = new URLSearchParams({
        expand: 'venue,category',
      });
      if (keyword) destinationParams.set('q', keyword);
      if (page) destinationParams.set('page', String(page));
      const destinationRes = await fetchEventbrite(`/destination/events/?${destinationParams.toString()}`, headers);
      if (destinationRes.ok) {
        const destinationData = await destinationRes.json();
        if ((destinationData.events || []).length > 0) {
          return jsonResponse(destinationData);
        }
      }

      return jsonResponse({
        events: [],
        pagination: { object_count: 0, page_number: Number(page || 1), page_size: 50, page_count: 0, has_more_items: false },
      });
    }

    return jsonResponse({ error: 'Unknown action. Use: validate_token, list_organizations, list_events, search_events' }, 400);
  } catch (error: unknown) {
    console.error('Eventbrite import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
