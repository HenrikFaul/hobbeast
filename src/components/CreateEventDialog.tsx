import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { PlaceAutocomplete, type PlaceSelection } from '@/components/PlaceAutocomplete';
import { hu } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, CalendarPlus, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { HOBBY_CATALOG, type HobbyCategory, type HobbySubcategory, type HobbyActivity, type ActivityProfile } from '@/lib/hobbyCategories';
import { MapyTripPlanner } from '@/components/MapyTripPlanner';
import type { TripPlanDraft } from '@/lib/mapy';
import { upsertEventTripPlan } from '@/lib/tripPlans';

const LOCATION_TYPES = [
  { value: 'city', label: 'Város' },
  { value: 'address', label: 'Pontos cím' },
  { value: 'free', label: 'Szabad megadás' },
  { value: 'online', label: 'Online' },
];

interface CreateEventDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEventDialog({ onClose, onCreated }: CreateEventDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Category selection (3-level)
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');

  const [eventDate, setEventDate] = useState<Date>();
  const [eventTime, setEventTime] = useState('');
  const [locationType, setLocationType] = useState('city');
  const [locationCity, setLocationCity] = useState('');
  const [locationDistrict, setLocationDistrict] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationFreeText, setLocationFreeText] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLon, setLocationLon] = useState<number | null>(null);
  const [placeData, setPlaceData] = useState<PlaceSelection | null>(null);
  const [maxAttendees, setMaxAttendees] = useState('');
  const [imageEmoji, setImageEmoji] = useState('🎉');
  const [tags, setTags] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [loading, setLoading] = useState(false);
  const [tripPlan, setTripPlan] = useState<TripPlanDraft | null>(null);
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Derived data
  const selectedCategory: HobbyCategory | undefined = HOBBY_CATALOG.find(c => c.id === selectedCategoryId);
  const selectedSubcategory: HobbySubcategory | undefined = selectedCategory?.subcategories.find(s => s.id === selectedSubcategoryId);
  const selectedActivity: HobbyActivity | undefined = selectedSubcategory?.activities.find(a => a.id === selectedActivityId);

  // Resolved profile (activity overrides subcategory)
  const profile: ActivityProfile | null = useMemo(() => {
    if (!selectedSubcategory) return null;
    return { ...selectedSubcategory.profile, ...(selectedActivity?.profile || {}) } as ActivityProfile;
  }, [selectedSubcategory, selectedActivity]);

  // Auto-set defaults when profile changes
  const handleCategoryChange = (catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedSubcategoryId('');
    setSelectedActivityId('');
  };

  const handleSubcategoryChange = (subId: string) => {
    setSelectedSubcategoryId(subId);
    setSelectedActivityId('');
    const sub = selectedCategory?.subcategories.find(s => s.id === subId);
    if (sub) {
      // Auto-set emoji and defaults from profile
      setImageEmoji(sub.emoji || selectedCategory?.emoji || '🎉');
      if (sub.profile.suggestedDurationMin) setDuration(String(sub.profile.suggestedDurationMin));
      setMaxAttendees(String(sub.profile.groupSize.typical));
      // Set location type based on profile
      if (sub.profile.canBeOnline && sub.profile.locationTypes.includes('online')) {
        setLocationType('online');
      } else {
        setLocationType('city');
      }
    }
  };

  const handleActivityChange = (actId: string) => {
    setSelectedActivityId(actId);
    const act = selectedSubcategory?.activities.find(a => a.id === actId);
    if (act?.emoji) setImageEmoji(act.emoji);
  };

  // Build category string for DB: "Category > Subcategory > Activity"
  const categoryString = [
    selectedCategory?.name,
    selectedSubcategory?.name,
    selectedActivity?.name,
  ].filter(Boolean).join(' › ');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !selectedCategoryId || !selectedSubcategoryId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        category: categoryString,
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
        created_by: user.id,
        // Place data from normalized search
        place_name: placeData?.displayName || null,
        place_address: placeData?.address || null,
        place_city: placeData?.city || null,
        place_lat: placeData?.lat || null,
        place_lon: placeData?.lon || null,
        place_source: placeData?.source || null,
        place_categories: placeData?.categories || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      toast.error('Hiba az esemény létrehozásakor.');
    } else {
      try {
        await upsertEventTripPlan(data.id, tripPlan);
        toast.success('Esemény sikeresen létrehozva!');
        onCreated();
      } catch (tripPlanError) {
        console.error('Trip plan save failed', tripPlanError);
        toast.error('Az esemény létrejött, de az útvonalterv mentése nem sikerült.');
        onCreated();
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarPlus className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-display text-lg font-bold">Új esemény létrehozása</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esemény neve *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="pl. Vasárnapi futás" required className="rounded-xl h-11" />
          </div>

          {/* 3-level category selection */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategória *</Label>
            <Select value={selectedCategoryId} onValueChange={handleCategoryChange}>
              <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Főkategória..." /></SelectTrigger>
              <SelectContent className="rounded-xl max-h-60">
                {HOBBY_CATALOG.map(cat => (
                  <SelectItem key={cat.id} value={cat.id} className="rounded-lg">
                    {cat.emoji} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedCategory && (
              <Select value={selectedSubcategoryId} onValueChange={handleSubcategoryChange}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Alkategória..." /></SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {selectedCategory.subcategories.map(sub => (
                    <SelectItem key={sub.id} value={sub.id} className="rounded-lg">
                      {sub.emoji} {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedSubcategory && (
              <Select value={selectedActivityId} onValueChange={handleActivityChange}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Tevékenység (opcionális)..." /></SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {selectedSubcategory.activities.map(act => (
                    <SelectItem key={act.id} value={act.id} className="rounded-lg">
                      {act.emoji} {act.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Emoji */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emoji ikon</Label>
            <Input value={imageEmoji} onChange={e => setImageEmoji(e.target.value)} className="rounded-xl h-11 text-center text-2xl w-20" maxLength={2} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leírás (max. 300 karakter)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 300))} placeholder="Részletek..." className="rounded-xl" maxLength={300} />
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

          {/* Dynamic fields based on profile */}
          {profile && (
            <div className="space-y-3 rounded-xl border border-dashed p-3 bg-muted/20">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kategória-specifikus mezők</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Max. létszám</Label>
                  <Input type="number" min={profile.groupSize.min} max={500}
                    value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)}
                    placeholder={`${profile.groupSize.min}–${profile.groupSize.max}`}
                    className="rounded-xl h-10 text-sm" />
                </div>

                {profile.hasDuration && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Időtartam (perc)</Label>
                    <Input type="number" min={15} max={1440}
                      value={duration} onChange={e => setDuration(e.target.value)}
                      placeholder={profile.suggestedDurationMin ? `${profile.suggestedDurationMin}` : 'perc'}
                      className="rounded-xl h-10 text-sm" />
                  </div>
                )}

                {profile.hasDistance && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Távolság / Hossz (km)</Label>
                    <Input type="number" min={0} step={0.1}
                      value={distance} onChange={e => setDistance(e.target.value)}
                      placeholder="pl. 10"
                      className="rounded-xl h-10 text-sm" />
                  </div>
                )}

                {profile.hasSkillLevel && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Szint</Label>
                    <Select value={skillLevel} onValueChange={setSkillLevel}>
                      <SelectTrigger className="rounded-xl h-10 text-sm"><SelectValue placeholder="Bárki..." /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="beginner" className="rounded-lg">Kezdő</SelectItem>
                        <SelectItem value="intermediate" className="rounded-lg">Haladó</SelectItem>
                        <SelectItem value="advanced" className="rounded-lg">Profi</SelectItem>
                        <SelectItem value="any" className="rounded-lg">Mindegy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín típusa</Label>
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

            {(locationType === 'city' || locationType === 'address') && (
              <PlaceAutocomplete
                value={[locationAddress, locationDistrict, locationCity].filter(Boolean).join(', ')}
                onSelect={(sel: PlaceSelection) => {
                  setLocationCity(sel.city);
                  setLocationDistrict(sel.district);
                  setLocationAddress(sel.address || sel.displayName);
                  setLocationFreeText('');
                  setLocationLat(sel.lat || null);
                  setLocationLon(sel.lon || null);
                  setPlaceData(sel);
                }}
                placeholder="Keress rá egy helyszínre..."
              />
            )}
            {locationType === 'free' && (
              <Input value={locationFreeText} onChange={e => setLocationFreeText(e.target.value)} placeholder="Szabadon megadott helyszín..." className="rounded-xl h-11" />
            )}
          </div>

          {profile?.hasDistance && !tripPlannerOpen && (
            <Button type="button" variant="outline" className="w-full h-11 rounded-xl" onClick={() => setTripPlannerOpen(true)}>
              🗺️ Túratervező használata
            </Button>
          )}
          {profile?.hasDistance && tripPlannerOpen && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Túra- / útvonalterv</Label>
                <Button type="button" variant="ghost" size="sm" className="rounded-xl text-xs" onClick={() => { setTripPlannerOpen(false); setTripPlan(null); }}>
                  <X className="h-3 w-3 mr-1" /> Bezárás
                </Button>
              </div>
              <MapyTripPlanner value={tripPlan} onChange={setTripPlan} />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Címkék (vesszővel elválasztva)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="pl. Kezdő-barát, Reggeli, Ingyenes" className="rounded-xl h-11" />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold"
            disabled={loading || !title.trim() || !selectedCategoryId || !selectedSubcategoryId}>
            {loading ? 'Létrehozás...' : 'Esemény létrehozása'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
