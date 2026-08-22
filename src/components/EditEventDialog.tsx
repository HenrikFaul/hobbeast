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
import type { TablesUpdate } from '@/integrations/supabase/types';

type EventUpdatePayload = TablesUpdate<'events'> & {
  start_time?: string | null;
  meeting_instructions?: string | null;
  expected_end_at?: string | null;
  beginner_friendly?: boolean | null;
  activity_intensity?: string | null;
  equipment_required?: string | null;
  accessibility_info?: string | null;
  cost_details?: string | null;
  cancellation_policy?: string | null;
  private_location_reveal_hours?: number;
};

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
    meeting_instructions?: string | null;
    expected_end_at?: string | null;
    beginner_friendly?: boolean | null;
    activity_intensity?: string | null;
    equipment_required?: string | null;
    accessibility_info?: string | null;
    cost_details?: string | null;
    cancellation_policy?: string | null;
    waitlist_enabled?: boolean | null;
    visibility_type?: string | null;
    private_location_reveal_hours?: number | null;
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
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);
  const [placeSel, setPlaceSel] = useState<PlaceSelection | null>(null);
  const [meetingInstructions, setMeetingInstructions] = useState(event.meeting_instructions || '');
  const [expectedEndTime, setExpectedEndTime] = useState(
    event.expected_end_at ? new Date(event.expected_end_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : '',
  );
  const [beginnerFriendly, setBeginnerFriendly] = useState<'unspecified' | 'yes' | 'no'>(
    event.beginner_friendly === null || event.beginner_friendly === undefined ? 'unspecified' : event.beginner_friendly ? 'yes' : 'no',
  );
  const [activityIntensity, setActivityIntensity] = useState(event.activity_intensity || '');
  const [equipmentRequired, setEquipmentRequired] = useState(event.equipment_required || '');
  const [accessibilityInfo, setAccessibilityInfo] = useState(event.accessibility_info || '');
  const [costDetails, setCostDetails] = useState(event.cost_details || '');
  const [cancellationPolicy, setCancellationPolicy] = useState(event.cancellation_policy || '');
  const [waitlistEnabled, setWaitlistEnabled] = useState(event.waitlist_enabled === true);
  const [visibilityType, setVisibilityType] = useState(event.visibility_type || 'public');
  const [privateLocationRevealHours, setPrivateLocationRevealHours] = useState(String(event.private_location_reveal_hours ?? 24));

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


const hasRequiredLocation = (() => {
  if (locationType === 'online') return true;
  if (locationType === 'free') return Boolean(locationFreeText.trim());
  return Boolean(locationCity.trim() || locationAddress.trim());
})();

const hasRequiredFields = Boolean(title.trim() && eventDate && eventTime && hasRequiredLocation);

const buildStartTimeIso = () => {
  if (!eventDate || !eventTime) return null;
  const [hours, minutes] = eventTime.split(':').map((value) => Number(value));
  const next = new Date(eventDate);
  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return next.toISOString();
};

const buildExpectedEndIso = () => {
  if (!eventDate || !expectedEndTime) return null;
  const [hours, minutes] = expectedEndTime.split(':').map((value) => Number(value));
  const next = new Date(eventDate);
  next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  const startTimeIso = buildStartTimeIso();
  if (startTimeIso && next <= new Date(startTimeIso)) next.setDate(next.getDate() + 1);
  return next.toISOString();
};

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasRequiredFields) return;

    setLoading(true);
    const startTimeIso = buildStartTimeIso();
    const expectedEndAt = buildExpectedEndIso();
    if (startTimeIso && expectedEndAt && new Date(expectedEndAt) <= new Date(startTimeIso)) {
      toast.error('A várható befejezésnek a kezdés után kell lennie.');
      setLoading(false);
      return;
    }
    const updatePayload: EventUpdatePayload = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate ? format(eventDate, 'yyyy-MM-dd') : null,
      event_time: eventTime || null,
      start_time: startTimeIso,
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
      place_categories: [],
      meeting_instructions: meetingInstructions.trim() || null,
      expected_end_at: expectedEndAt,
      beginner_friendly: beginnerFriendly === 'unspecified' ? null : beginnerFriendly === 'yes',
      activity_intensity: activityIntensity || null,
      equipment_required: equipmentRequired.trim() || null,
      accessibility_info: accessibilityInfo.trim() || null,
      cost_details: costDetails.trim() || null,
      cancellation_policy: cancellationPolicy.trim() || null,
      waitlist_enabled: waitlistEnabled,
      visibility_type: visibilityType,
      private_location_reveal_hours: Math.max(0, Math.min(168, Number(privateLocationRevealHours) || 24)),
    };

    if (placeSel) {
      updatePayload.place_name = placeSel.displayName;
      updatePayload.place_address = placeSel.address;
      updatePayload.place_city = placeSel.city;
      updatePayload.place_lat = placeSel.lat;
      updatePayload.place_lon = placeSel.lon;
      updatePayload.place_source = placeSel.source;
      updatePayload.place_categories = placeSel.categories || [];
    }

    const { error } = await supabase.from('events').update(updatePayload).eq('id', event.id);

    if (error) {
      toast.error(error?.message || 'Hiba a mentés során.');
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
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dátum *</Label>
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
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Időpont *</Label>
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="rounded-xl h-11" />
            </div>
          </div>

          <section className="space-y-4 rounded-xl border p-4" aria-labelledby="edit-event-expectations-title">
            <div>
              <h4 id="edit-event-expectations-title" className="font-semibold">Mire számíthatnak a résztvevők?</h4>
              <p className="text-xs text-muted-foreground">Csak ellenőrzött információt adj meg; a hiányzó mezők host feladatként maradnak láthatók.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-meeting-instructions">Találkozási instrukció</Label>
              <Textarea id="edit-meeting-instructions" value={meetingInstructions} onChange={(e) => setMeetingInstructions(e.target.value.slice(0, 1000))} maxLength={1000} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="edit-expected-end">Várható befejezés</Label><Input id="edit-expected-end" type="time" value={expectedEndTime} onChange={(e) => setExpectedEndTime(e.target.value)} /></div>
              <div className="space-y-2">
                <Label htmlFor="edit-beginner-friendly">Kezdőbarát</Label>
                <Select value={beginnerFriendly} onValueChange={(value) => setBeginnerFriendly(value as typeof beginnerFriendly)}><SelectTrigger id="edit-beginner-friendly"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">Nincs megadva</SelectItem><SelectItem value="yes">Igen</SelectItem><SelectItem value="no">Nem</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-activity-intensity">Aktivitási intenzitás</Label>
                <Select value={activityIntensity || 'unspecified'} onValueChange={(value) => setActivityIntensity(value === 'unspecified' ? '' : value)}><SelectTrigger id="edit-activity-intensity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">Nincs megadva</SelectItem><SelectItem value="könnyű">Könnyű</SelectItem><SelectItem value="közepes">Közepes</SelectItem><SelectItem value="intenzív">Intenzív</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="edit-equipment">Szükséges felszerelés</Label><Input id="edit-equipment" value={equipmentRequired} onChange={(e) => setEquipmentRequired(e.target.value.slice(0, 500))} maxLength={500} /></div>
              <div className="space-y-2"><Label htmlFor="edit-accessibility">Hozzáférhetőség</Label><Input id="edit-accessibility" value={accessibilityInfo} onChange={(e) => setAccessibilityInfo(e.target.value.slice(0, 500))} maxLength={500} /></div>
              <div className="space-y-2"><Label htmlFor="edit-cost">Költség / mi tartozik bele</Label><Input id="edit-cost" value={costDetails} onChange={(e) => setCostDetails(e.target.value.slice(0, 500))} maxLength={500} /></div>
              <div className="space-y-2"><Label htmlFor="edit-cancellation">Lemondási szabály</Label><Input id="edit-cancellation" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value.slice(0, 500))} maxLength={500} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-waitlist">Várólista</Label>
                <Select value={waitlistEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => setWaitlistEnabled(value === 'enabled')}><SelectTrigger id="edit-waitlist"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="disabled">Kikapcsolva</SelectItem><SelectItem value="enabled">Automatikus várólista</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-visibility">Láthatóság</Label>
                <Select value={visibilityType} onValueChange={setVisibilityType}><SelectTrigger id="edit-visibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Nyilvános</SelectItem><SelectItem value="members">Csak tagok</SelectItem><SelectItem value="private">Privát</SelectItem></SelectContent></Select>
              </div>
            </div>
            {visibilityType !== 'public' && <div className="space-y-2"><Label htmlFor="edit-location-reveal">Pontos helyszín teljes felfedése (kezdés előtt, óra)</Label><Input id="edit-location-reveal" type="number" min={0} max={168} value={privateLocationRevealHours} onChange={(e) => setPrivateLocationRevealHours(e.target.value)} /></div>}
          </section>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max. létszám</Label>
            <Input type="number" min={1} value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)} className="rounded-xl h-11" />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín *</Label>
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

          {!hasRequiredFields && (<p className="text-xs text-muted-foreground">A *-gal jelölt mezők kötelezőek. A mentés csak kitöltés után engedélyezett.</p>)}

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow font-semibold" disabled={loading || !title.trim()}>
            <Save className="h-4 w-4 mr-2" /> {loading ? 'Mentés...' : 'Módosítások mentése'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
