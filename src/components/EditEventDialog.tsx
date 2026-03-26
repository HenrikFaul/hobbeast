import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Save, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AddressAutocomplete, type AddressSelection } from '@/components/AddressAutocomplete';
import { MapyTripPlanner } from '@/components/MapyTripPlanner';
import { NormalizedPlaceSearch } from '@/components/NormalizedPlaceSearch';
import type { TripPlanDraft } from '@/lib/mapy';
import { getEventTripPlan, upsertEventTripPlan } from '@/lib/tripPlans';
import type { NormalizedPlaceDetails, NormalizedPlaceSummary } from '@/lib/places/types';
import { loadPlaceDetails } from '@/lib/places/client';
import { placeToEventColumns, placeToLegacyLocation } from '@/lib/places/eventMapping';

const LOCATION_TYPES = [
  { value: 'city', label: 'Város' },
  { value: 'address', label: 'Pontos cím' },
  { value: 'free', label: 'Szabad megadás' },
  { value: 'online', label: 'Online' },
];

interface EditEventDialogProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    event_date: string | null;
    event_time: string | null;
    location_type: string | null;
    location_city: string | null;
    location_district: string | null;
    location_address: string | null;
    location_free_text: string | null;
    location_lat?: number | null;
    location_lon?: number | null;
    place_source?: string | null;
    place_source_ids?: Record<string, unknown> | null;
    place_name?: string | null;
    place_categories?: string[] | null;
    place_category_confidence?: number | null;
    place_address?: string | null;
    place_city?: string | null;
    place_postcode?: string | null;
    place_country?: string | null;
    place_lat?: number | null;
    place_lon?: number | null;
    place_distance_m?: number | null;
    place_diagnostics?: Record<string, unknown> | null;
    place_details?: Record<string, unknown> | null;
    max_attendees: number | null;
    image_emoji: string | null;
    tags: string[] | null;
  };
  onClose: () => void;
  onUpdated: () => void;
}

export function EditEventDialog({ event, onClose, onUpdated }: EditEventDialogProps) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [eventDate, setEventDate] = useState<Date | undefined>(event.event_date ? new Date(event.event_date) : undefined);
  const [eventTime, setEventTime] = useState(event.event_time || '');
  const [locationType, setLocationType] = useState(event.location_type || 'city');
  const [locationCity, setLocationCity] = useState(event.location_city || '');
  const [locationDistrict, setLocationDistrict] = useState(event.location_district || '');
  const [locationAddress, setLocationAddress] = useState(event.location_address || '');
  const [locationFreeText, setLocationFreeText] = useState(event.location_free_text || '');
  const [locationLat, setLocationLat] = useState<number | null>(event.location_lat ?? null);
  const [locationLon, setLocationLon] = useState<number | null>(event.location_lon ?? null);
  const [maxAttendees, setMaxAttendees] = useState(event.max_attendees ? String(event.max_attendees) : '');
  const [imageEmoji, setImageEmoji] = useState(event.image_emoji || '🎉');
  const [tags, setTags] = useState((event.tags || []).join(', '));
  const [loading, setLoading] = useState(false);
  const [tripPlan, setTripPlan] = useState<TripPlanDraft | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NormalizedPlaceSummary | null>(event.place_name ? {
    id: String(event.id),
    source: (event.place_source as 'geoapify' | 'tomtom' | 'merged') || 'geoapify',
    sourceIds: (event.place_source_ids as Record<string, string>) || {},
    name: event.place_name,
    categories: (event.place_categories as any) || ['unknown'],
    categoryConfidence: event.place_category_confidence ?? undefined,
    address: event.place_address || undefined,
    city: event.place_city || undefined,
    postcode: event.place_postcode || undefined,
    country: event.place_country || undefined,
    lat: event.place_lat ?? event.location_lat ?? 0,
    lon: event.place_lon ?? event.location_lon ?? 0,
    distanceM: event.place_distance_m ?? undefined,
    diagnostics: (event.place_diagnostics as any) || undefined,
  } : null);
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<NormalizedPlaceDetails | null>((event.place_details as any) || null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    let mounted = true;
    void getEventTripPlan(event.id)
      .then((plan) => {
        if (mounted) setTripPlan(plan);
      })
      .catch((error) => console.error('Failed to load trip plan', error));
    return () => {
      mounted = false;
    };
  }, [event.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    const legacyLocation = selectedPlace ? placeToLegacyLocation(selectedPlace) : null;
    const placeColumns = placeToEventColumns(selectedPlace, selectedPlaceDetails);
    const { error } = await supabase.from('events').update({
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate ? format(eventDate, 'yyyy-MM-dd') : null,
      event_time: eventTime || null,
      location_type: legacyLocation?.location_type || locationType,
      location_city: legacyLocation?.location_city || locationCity || null,
      location_district: locationDistrict || null,
      location_address: legacyLocation?.location_address || locationAddress || null,
      location_free_text: legacyLocation?.location_free_text || locationFreeText || null,
      location_lat: legacyLocation?.location_lat ?? locationLat,
      location_lon: legacyLocation?.location_lon ?? locationLon,
      max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      image_emoji: imageEmoji,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      ...placeColumns,
    }).eq('id', event.id);

    if (error) {
      toast.error('Hiba a mentés során.');
    } else {
      try {
        await upsertEventTripPlan(event.id, tripPlan);
        toast.success('Esemény frissítve!');
        onUpdated();
      } catch (tripPlanError) {
        console.error('Trip plan update failed', tripPlanError);
        toast.error('Az esemény frissült, de az útvonalterv mentése nem sikerült.');
        onUpdated();
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Esemény szerkesztése</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esemény neve</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required className="rounded-xl h-11" />
          </div>

          <div className="flex gap-3 items-end">
            <div className="space-y-2 flex-shrink-0">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emoji</Label>
              <Input value={imageEmoji} onChange={e => setImageEmoji(e.target.value)} className="rounded-xl h-11 text-center text-2xl w-20" maxLength={2} />
            </div>
            <div className="space-y-2 flex-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategória</Label>
              <Input value={event.category} disabled className="rounded-xl h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leírás</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 300))} className="rounded-xl" maxLength={300} />
            <p className="text-xs text-muted-foreground text-right">{description.length}/300</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dátum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl h-11", !eventDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {eventDate ? format(eventDate, 'yyyy. MM. dd.', { locale: hu }) : 'Válassz...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={eventDate} onSelect={setEventDate} disabled={(date) => date < today} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Időpont</Label>
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="rounded-xl h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max. létszám</Label>
            <Input type="number" min={1} value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)} className="rounded-xl h-11" />
          </div>

          <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
            <NormalizedPlaceSearch
              label="Venue / hely keresése (Geoapify + TomTom)"
              value={selectedPlace}
              onSelect={(item) => {
                setSelectedPlace(item);
                const legacy = placeToLegacyLocation(item);
                setLocationType('address');
                setLocationCity(legacy.location_city || '');
                setLocationAddress(legacy.location_address || '');
                setLocationFreeText(legacy.location_free_text || '');
                setLocationLat(legacy.location_lat);
                setLocationLon(legacy.location_lon);
                void loadPlaceDetails(item).then((response) => setSelectedPlaceDetails(response.item)).catch(() => setSelectedPlaceDetails(null));
              }}
              featurePath="event_edit"
              latitude={locationLat || undefined}
              longitude={locationLon || undefined}
            />
            {selectedPlace && (
              <div className="text-xs text-muted-foreground">
                A venue-kiválasztás frissíti az esemény strukturált place mezőit is.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín</Label>
            <Select value={locationType} onValueChange={(nextType) => {
              setLocationType(nextType);
              if (nextType === 'free' || nextType === 'online') {
                setLocationCity('');
                setLocationDistrict('');
                setLocationAddress('');
                setLocationLat(null);
                setLocationLon(null);
              }
              if (nextType !== 'free') {
                setLocationFreeText('');
              }
            }}>
              <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {LOCATION_TYPES.map(lt => <SelectItem key={lt.value} value={lt.value} className="rounded-lg">{lt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {['city', 'address'].includes(locationType) && (
              <AddressAutocomplete
                value={[locationAddress, locationDistrict, locationCity].filter(Boolean).join(', ')}
                onSelect={(sel: AddressSelection) => {
                  setLocationCity(sel.city);
                  setLocationDistrict(sel.district);
                  setLocationAddress(sel.address || sel.displayName);
                  setLocationFreeText('');
                  setLocationLat(sel.lat || null);
                  setLocationLon(sel.lon || null);
                }}
                placeholder="Keress rá egy címre..."
              />
            )}
            {locationType === 'free' && (
              <Input value={locationFreeText} onChange={e => setLocationFreeText(e.target.value)} placeholder="Helyszín" className="rounded-xl h-11" />
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Túra- / útvonalterv (opcionális)</Label>
            <MapyTripPlanner value={tripPlan} onChange={setTripPlan} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Címkék (vesszővel)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} className="rounded-xl h-11" />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow font-semibold" disabled={loading || !title.trim()}>
            <Save className="h-4 w-4 mr-2" /> {loading ? 'Mentés...' : 'Módosítások mentése'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
