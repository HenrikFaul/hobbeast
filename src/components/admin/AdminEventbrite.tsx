import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckCircle, Info } from "lucide-react";
import { searchEventbriteEvents, fetchEventbriteOrganizations, fetchEventbriteEvents, type MappedEventbriteEvent } from "@/lib/eventbrite";
import { toast } from "sonner";

export function AdminEventbrite() {
  const [keyword, setKeyword] = useState("Budapest");
  const [events, setEvents] = useState<MappedEventbriteEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      const result = await searchEventbriteEvents(keyword, 1);
      setEvents(result.events);
      if (result.events.length > 0) {
        toast.success(`${result.events.length} esemény betöltve az Eventbrite-ról`);
      } else {
        setDebugInfo('Az Eventbrite API nem adott vissza eseményeket. Ez lehet a keresési kifejezés, az API kulcs jogosultsága, vagy az Eventbrite API korlátozása miatt.');
      }
    } catch (err: any) {
      setError(err.message || 'Hiba az Eventbrite API hívásnál');
      toast.error('Eventbrite hiba');
    }
    setLoading(false);
  };

  const handleOrgPull = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      const orgs = await fetchEventbriteOrganizations();
      if (orgs.organizations?.length > 0) {
        const orgId = orgs.organizations[0].id;
        const result = await fetchEventbriteEvents(orgId, 1);
        setEvents(result.events);
        toast.success(`${result.events.length} szervezeti esemény betöltve`);
      } else {
        setDebugInfo('Nincs szervezet társítva az Eventbrite API kulcshoz. Az Eventbrite v3 API csak szervezeti eseményeket tud listázni. Hozz létre egy szervezetet az Eventbrite dashboardon, vagy használj személyes OAuth tokent.');
      }
    } catch (err: any) {
      setError(err.message || 'Hiba');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Külső forrás import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 text-sm">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="font-medium">Eventbrite integráció</p>
              <p className="text-muted-foreground text-xs mt-1">
                Az Eventbrite v3 API a keresés és a szervezeti események lekérdezését támogatja. 
                Ha az API kulcs egy szervezethez tartozik, a szervezeti események automatikusan megjelennek.
                A kulcsszavas keresés a publikus eseményeket keresi.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Keresés (pl. Budapest, sakk, túra)..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-9"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4 mr-1" />
              Keresés
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleOrgPull} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Szervezeti események
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {debugInfo && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-sm">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <span className="text-muted-foreground">{debugInfo}</span>
            </div>
          )}

          {events.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">{events.length} esemény betöltve</span>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <span className="text-2xl">{ev.image_emoji || '📅'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.event_date || '—'} · {ev.location_city || 'Online'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{ev.category}</Badge>
                      {ev.eventbrite_url && (
                        <a href={ev.eventbrite_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
