import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('MAPY_CZ_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'MAPY_CZ_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, params } = await req.json() as {
      action: 'suggest' | 'geocode' | 'reverse_geocode' | 'route' | 'elevation';
      params: Record<string, unknown>;
    };

    if (action === 'suggest' || action === 'geocode') {
      const { query, locality } = params as { query: string; locality?: string };
      const endpoint = action === 'suggest' ? 'suggest' : 'geocode';
      const url = `https://api.mapy.com/v1/${endpoint}?apikey=${apiKey}&query=${encodeURIComponent(query)}&lang=en&limit=8&type=regional,poi${locality ? `&locality=${encodeURIComponent(locality)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mapy ${endpoint} error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reverse_geocode') {
      const { lat, lon } = params as { lat: number; lon: number };
      const url = `https://api.mapy.com/v1/rgeocode?apikey=${apiKey}&lat=${lat}&lon=${lon}&lang=en`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mapy reverse geocode error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'route') {
      const { start, end, waypoints = [], routeType = 'foot_fast' } = params as {
        start: { lat: number; lon: number };
        end: { lat: number; lon: number };
        waypoints?: { lat: number; lon: number }[];
        routeType?: string;
      };

      let url = `https://api.mapy.cz/v1/routing/route?apikey=${apiKey}` +
        `&start=${start.lon},${start.lat}` +
        `&end=${end.lon},${end.lat}` +
        `&routeType=${routeType}` +
        `&format=geojson` +
        `&lang=cs`;

      if (waypoints.length > 0) {
        const wp = waypoints.map(w => `${w.lon},${w.lat}`).join('|');
        url += `&waypoints=${wp}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mapy.cz routing error ${res.status}: ${body}`);
      }
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'elevation') {
      const { coordinates } = params as {
        coordinates: [number, number][]; // [lon, lat][]
      };

      // Mapy.cz elevation API: POST with coordinates
      const url = `https://api.mapy.cz/v1/elevation?apikey=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates: coordinates.map(([lon, lat]) => ({ lon, lat })),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mapy.cz elevation error ${res.status}: ${body}`);
      }
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('mapy-routing error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
