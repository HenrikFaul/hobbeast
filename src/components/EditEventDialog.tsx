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
import { PlaceAutocomplete, type PlaceSelection } from '@/components/PlaceAutocomplete';
import { MapyTripPlanner } from '@/components/MapyTripPlanner';
import type { TripPlanDraft } from '@/lib/mapy';
import { getEventTripPlan, upsertEventTripPlan } from '@/lib/tripPlans';

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
  const [placeSel, setPlaceSel] = useState<PlaceSelection | null>(null);

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
    const updatePayload: any = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate ? format(eventDate, 'yyyy-MM-dd') : null,
      event_time: eventTime || null,
      location_type: locationType,
      location_city: locationCity || null,
      location_district: locationDistrict || null,
      location_address: locationAddress || null,
      location_free_text: locationFreeText || null,
      location_lat: locationLat,
      location_lon: locationLon,
      max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      image_emoji: imageEmoji,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    };

    if (placeSel) {
      updatePayload.place_name = placeSel.displayName;
      updatePayload.place_address = placeSel.address;
      updatePayload.place_city = placeSel.city;
      updatePayload.place_lat = placeSel.lat;
      updatePayload.place_lon = placeSel.lon;
      updatePayload.place_source = placeSel.source;
      updatePayload.place_categories = placeSel.categories;
    }

    const { error } = await supabase.from('events').update(updatePayload).eq('id', event.id);

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
              <PlaceAutocomplete
                value={[locationAddress, locationDistrict, locationCity].filter(Boolean).join(', ')}
                onSelect={(sel: PlaceSelection) => {
                  setLocationCity(sel.city);
                  setLocationDistrict(sel.district);
                  setLocationAddress(sel.address || sel.displayName);
                  setLocationFreeText('');
                  setLocationLat(sel.lat || null);
                  setLocationLon(sel.lon || null);
                  // Also update place fields in the save
                  setPlaceSel(sel);
                }}
                placeholder="Keress rá egy helyszínre..."
              />
            )}
            {locationType === 'free' && (
              <Input value={locationFreeText} onChange={e => setLocationFreeText(e.target.value)} placeholder="Helyszín" className="rounded-xl h-11" />
            )}
          </div>

          {/* Trip planner — only for distance-based categories, matching create flow */}
          {!tripPlannerOpen && (
            <Button type="button" variant="outline" className="w-full h-11 rounded-xl" onClick={() => setTripPlannerOpen(true)}>
              🗺️ Túratervező használata
            </Button>
          )}
          {tripPlannerOpen && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Túra- / útvonalterv</Label>
                <Button type="button" variant="ghost" size="sm" className="rounded-xl text-xs" onClick={() => setTripPlannerOpen(false)}>
                  <X className="h-3 w-3 mr-1" /> Bezárás
                </Button>
              </div>
              <MapyTripPlanner value={tripPlan} onChange={setTripPlan} />
            </div>
          )}

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
