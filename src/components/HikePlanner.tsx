import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ElevationChart } from '@/components/ElevationChart';
import { MapPin, Plus, Trash2, Route, Loader2, Mountain, Clock, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import {
  planRoute,
  getElevation,
  calculateAscentDescent,
  formatDistance,
  formatDuration,
  type LatLon,
  type MapyRouteType,
  type ElevationPoint,
} from '@/lib/mapyCz';

const ROUTE_TYPES: { value: MapyRouteType; label: string }[] = [
  { value: 'foot_hiking', label: '🥾 Túra (hiking)' },
  { value: 'foot_fast', label: '🚶 Gyaloglás' },
  { value: 'bike_mountain', label: '🚵 Mountain bike' },
  { value: 'bike_road', label: '🚴 Országúti kerékpár' },
];

interface WaypointInput {
  id: string;
  label: string;
  lat: string;
  lon: string;
}

export interface HikeRouteData {
  routeType: MapyRouteType;
  waypoints: LatLon[];
  geometry: unknown;
  elevationProfile: ElevationPoint[];
  totalDistanceM: number;
  totalDurationS: number;
  totalAscentM: number;
  totalDescentM: number;
}

interface HikePlannerProps {
  onRouteReady?: (data: HikeRouteData) => void;
}

let nextId = 1;
function makeId() {
  return `wp-${nextId++}`;
}

export function HikePlanner({ onRouteReady }: HikePlannerProps) {
  const [routeType, setRouteType] = useState<MapyRouteType>('foot_hiking');
  const [waypoints, setWaypoints] = useState<WaypointInput[]>([
    { id: makeId(), label: 'Indulás', lat: '', lon: '' },
    { id: makeId(), label: 'Cél', lat: '', lon: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<HikeRouteData | null>(null);

  const updateWaypoint = (id: string, field: 'lat' | 'lon', value: string) => {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const addWaypoint = () => {
    const newWp = { id: makeId(), label: `Köztes pont ${waypoints.length - 1}`, lat: '', lon: '' };
    setWaypoints(prev => [...prev.slice(0, -1), newWp, prev[prev.length - 1]]);
  };

  const removeWaypoint = (id: string) => {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  };

  const handlePlanRoute = useCallback(async () => {
    const parsed = waypoints.map(w => ({
      lat: parseFloat(w.lat),
      lon: parseFloat(w.lon),
    }));

    if (parsed.some(p => isNaN(p.lat) || isNaN(p.lon))) {
      toast.error('Kérlek töltsd ki az összes koordinátát (szélesség, hosszúság).');
      return;
    }

    if (parsed.length < 2) {
      toast.error('Legalább indulási és célpontot adj meg.');
      return;
    }

    setLoading(true);
    try {
      const start = parsed[0];
      const end = parsed[parsed.length - 1];
      const intermediateWps = parsed.slice(1, -1);

      const route = await planRoute(start, end, intermediateWps, routeType);

      // Extract coordinates from geometry for elevation
      let coords: [number, number][] = [];
      const geom = route.geometry as any;
      if (geom?.type === 'FeatureCollection' && geom.features?.length > 0) {
        for (const feature of geom.features) {
          if (feature.geometry?.coordinates) {
            coords.push(...feature.geometry.coordinates);
          }
        }
      } else if (geom?.type === 'Feature' && geom.geometry?.coordinates) {
        coords = geom.geometry.coordinates;
      } else if (geom?.coordinates) {
        coords = geom.coordinates;
      }

      let elevations: ElevationPoint[] = [];
      let totalAscent = 0;
      let totalDescent = 0;

      if (coords.length > 0) {
        try {
          elevations = await getElevation(coords);
          const ad = calculateAscentDescent(elevations);
          totalAscent = ad.totalAscent;
          totalDescent = ad.totalDescent;
        } catch (e) {
          console.warn('Elevation query failed, continuing without:', e);
        }
      }

      const data: HikeRouteData = {
        routeType,
        waypoints: parsed,
        geometry: route.geometry,
        elevationProfile: elevations,
        totalDistanceM: route.length,
        totalDurationS: route.duration,
        totalAscentM: totalAscent,
        totalDescentM: totalDescent,
      };

      setRouteResult(data);
      onRouteReady?.(data);
      toast.success('Útvonal sikeresen megtervezve!');
    } catch (error) {
      console.error('Route planning error:', error);
      toast.error('Hiba az útvonaltervezés során. Ellenőrizd a koordinátákat.');
    } finally {
      setLoading(false);
    }
  }, [waypoints, routeType, onRouteReady]);

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-primary" />
        <h4 className="font-display font-semibold text-sm">Túratervező</h4>
        <span className="text-[10px] text-muted-foreground ml-auto">powered by Mapy.cz</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Útvonal típusa</Label>
        <Select value={routeType} onValueChange={(v) => setRouteType(v as MapyRouteType)}>
          <SelectTrigger className="rounded-xl h-10 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {ROUTE_TYPES.map(rt => (
              <SelectItem key={rt.value} value={rt.value} className="rounded-lg">{rt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Útpontok (lat, lon)</Label>
        {waypoints.map((wp, i) => (
          <div key={wp.id} className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-xs text-muted-foreground w-16 flex-shrink-0 truncate">{wp.label}</span>
            <Input
              type="number"
              step="any"
              value={wp.lat}
              onChange={e => updateWaypoint(wp.id, 'lat', e.target.value)}
              placeholder="Szélesség"
              className="rounded-lg h-9 text-xs flex-1"
            />
            <Input
              type="number"
              step="any"
              value={wp.lon}
              onChange={e => updateWaypoint(wp.id, 'lon', e.target.value)}
              placeholder="Hosszúság"
              className="rounded-lg h-9 text-xs flex-1"
            />
            {i > 0 && i < waypoints.length - 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => removeWaypoint(wp.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
        ))}

        {waypoints.length < 17 && (
          <Button type="button" variant="outline" size="sm" onClick={addWaypoint} className="rounded-lg text-xs w-full">
            <Plus className="h-3 w-3 mr-1" /> Köztes pont hozzáadása
          </Button>
        )}
      </div>

      <Button
        type="button"
        onClick={handlePlanRoute}
        disabled={loading}
        className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
      >
        {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tervezés...</> : <><Route className="h-4 w-4 mr-2" /> Útvonal tervezése</>}
      </Button>

      {routeResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-card border p-2">
              <Ruler className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground">Távolság</p>
                <p className="text-sm font-semibold">{formatDistance(routeResult.totalDistanceM)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-card border p-2">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground">Becsült idő</p>
                <p className="text-sm font-semibold">{formatDuration(routeResult.totalDurationS)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-card border p-2">
              <Mountain className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground">Össz. emelkedés</p>
                <p className="text-sm font-semibold">↑ {routeResult.totalAscentM} m</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-card border p-2">
              <Mountain className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Össz. lejtés</p>
                <p className="text-sm font-semibold">↓ {routeResult.totalDescentM} m</p>
              </div>
            </div>
          </div>

          {routeResult.elevationProfile.length > 1 && (
            <ElevationChart
              elevations={routeResult.elevationProfile}
              totalDistanceM={routeResult.totalDistanceM}
            />
          )}
        </div>
      )}
    </div>
  );
}
