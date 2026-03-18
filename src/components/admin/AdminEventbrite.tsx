import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckCircle } from "lucide-react";
import { searchEventbriteEvents, fetchEventbriteOrganizations, fetchEventbriteEvents, type MappedEventbriteEvent } from "@/lib/eventbrite";
import { toast } from "sonner";

export function AdminEventbrite() {
  const [keyword, setKeyword] = useState("Budapest");
  const [events, setEvents] = useState<MappedEventbriteEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgMode, setOrgMode] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchEventbriteEvents(keyword, 1);
      setEvents(result.events);
      toast.success(`${result.events.length} esemény betöltve az Eventbrite-ról`);
    } catch (err: any) {
      setError(err.message || 'Hiba az Eventbrite API hívásnál');
      toast.error('Eventbrite hiba');
    }
    setLoading(false);
  };

  const handleOrgPull = async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await fetchEventbriteOrganizations();
      if (orgs.organizations?.length > 0) {
        const orgId = orgs.organizations[0].id;
        const result = await fetchEventbriteEvents(orgId, 1);
        setEvents(result.events);
        toast.success(`${result.events.length} szervezeti esemény betöltve`);
      } else {
        setError('Nincs szervezet társítva az Eventbrite fiókhoz.');
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
            <RefreshCw className="h-5 w-5 text-primary" /> Eventbrite import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Eseményeket húzhatsz be az Eventbrite API-ból kulcsszavas kereséssel vagy szervezeti fiók alapján.
          </p>

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

              <p className="text-xs text-muted-foreground">
                Ezek az események automatikusan megjelennek az Events oldalon a „Külső programok" szűrővel.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
