import { supabase } from '@/integrations/supabase/client';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteResult {
  length: number; // meters
  duration: number; // seconds
  geometry: GeoJSON.FeatureCollection | GeoJSON.Feature;
  routePoints?: unknown[];
}

export interface ElevationPoint {
  lon: number;
  lat: number;
  altitude: number;
}

export type MapyRouteType =
  | 'car_fast'
  | 'car_fast_traffic'
  | 'car_short'
  | 'foot_fast'
  | 'foot_hiking'
  | 'bike_road'
  | 'bike_mountain';

export async function planRoute(
  start: LatLon,
  end: LatLon,
  waypoints: LatLon[] = [],
  routeType: MapyRouteType = 'foot_hiking'
): Promise<RouteResult> {
  const { data, error } = await supabase.functions.invoke('mapy-routing', {
    body: {
      action: 'route',
      params: { start, end, waypoints, routeType },
    },
  });

  if (error) throw new Error(error.message || 'Route planning failed');
  return data as RouteResult;
}

export async function getElevation(
  coordinates: [number, number][] // [lon, lat][]
): Promise<ElevationPoint[]> {
  // Sample coordinates if too many (max ~200 per request)
  const sampled = sampleCoordinates(coordinates, 200);

  const { data, error } = await supabase.functions.invoke('mapy-routing', {
    body: {
      action: 'elevation',
      params: { coordinates: sampled },
    },
  });

  if (error) throw new Error(error.message || 'Elevation query failed');
  
  // The API returns items with altitude
  const items = (data as any)?.items || data?.coordinates || [];
  return items.map((item: any) => ({
    lon: item.lon,
    lat: item.lat,
    altitude: item.altitude ?? item.elevation ?? 0,
  }));
}

function sampleCoordinates(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  return result;
}

export function calculateAscentDescent(elevations: ElevationPoint[]): {
  totalAscent: number;
  totalDescent: number;
} {
  let totalAscent = 0;
  let totalDescent = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i].altitude - elevations[i - 1].altitude;
    if (diff > 0) totalAscent += diff;
    else totalDescent += Math.abs(diff);
  }
  return { totalAscent: Math.round(totalAscent), totalDescent: Math.round(totalDescent) };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${mins} perc`;
  return `${hours} óra ${mins} perc`;
}
