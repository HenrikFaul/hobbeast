import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PlaceAutocomplete, type PlaceSelection } from '@/components/PlaceAutocomplete';
import { ActivityAutocomplete, type ActivitySelection } from '@/components/ActivityAutocomplete';
import { VenueSuggestionsPanel, type VenueSelection } from '@/components/VenueSuggestionsPanel';
import { EventTemplateSelector, SaveAsTemplateButton } from '@/components/EventTemplateSelector';
import { hu } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
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
import { linkEventToCircle } from '@/features/community/eventPlanning';
import { applyEventTemplateToDraft } from '@/features/organizer/eventTemplates';
import {
  buildEventInsertPayload,
  createEventRecord,
} from '@/features/events/createEvent';
import { CreateEventErrorBoundary } from '@/features/events/CreateEventErrorBoundary';
import { CreateEventExpectationsFields } from '@/features/events/CreateEventExpectationsFields';
import { EventReadinessMeter } from '@/components/events/EventReadinessMeter';
import { EventLivePreview } from '@/components/events/EventLivePreview';
import { suggestEmoji, suggestTags, type ReadinessDraft } from '@/features/events/eventReadiness';

const LOCATION_TYPES = [
  { value: 'city', label: 'Város' },
  { value: 'address', label: 'Pontos cím' },
  { value: 'free', label: 'Szabad megadás' },
  { value: 'online', label: 'Online' },
];

interface CreateEventDialogProps {
  onClose: () => void;
  onCreated: () => void;
  circleId?: string;
}

export function CreateEventDialog({ onClose, onCreated, circleId }: CreateEventDialogProps) {
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
  const [venueSearchHint, setVenueSearchHint] = useState('');
  const [meetingInstructions, setMeetingInstructions] = useState('');
  const [expectedEndTime, setExpectedEndTime] = useState('');
  const [beginnerFriendly, setBeginnerFriendly] = useState<'unspecified' | 'yes' | 'no'>('unspecified');
  const [activityIntensity, setActivityIntensity] = useState('');
  const [equipmentRequired, setEquipmentRequired] = useState('');
  const [accessibilityInfo, setAccessibilityInfo] = useState('');
  const [costDetails, setCostDetails] = useState('');
  const [cancellationPolicy, setCancellationPolicy] = useState('');
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [visibilityType, setVisibilityType] = useState('public');
  const [privateLocationRevealHours, setPrivateLocationRevealHours] = useState('24');

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
  const handleCategoryChange = useCallback((catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedSubcategoryId('');
    setSelectedActivityId('');
    setVenueSearchHint('');
  }, []);

  const handleSubcategoryChange = useCallback((subId: string) => {
    setSelectedSubcategoryId(subId);
    setSelectedActivityId('');
    const sub = selectedCategory?.subcategories.find(s => s.id === subId);
    if (sub) {
      setImageEmoji(sub.emoji || selectedCategory?.emoji || '🎉');
      if (sub.profile.suggestedDurationMin) setDuration(String(sub.profile.suggestedDurationMin));
      setMaxAttendees(String(sub.profile.groupSize.typical));
      setVenueSearchHint(sub.name);
      if (sub.profile.canBeOnline && sub.profile.locationTypes.includes('online')) {
        setLocationType('online');
      } else {
        setLocationType('city');
      }
    }
  }, [selectedCategory]);

  const handleActivityChange = useCallback((actId: string) => {
    setSelectedActivityId(actId);
    const act = selectedSubcategory?.activities.find(a => a.id === actId);
    if (act?.emoji) setImageEmoji(act.emoji);
    const hint = [act?.name, selectedSubcategory?.name].filter(Boolean).join(' ');
    setVenueSearchHint(hint);
  }, [selectedSubcategory]);

  const handleActivityAutocomplete = useCallback((sel: ActivitySelection) => {
    setSelectedCategoryId(sel.categoryId);
    setSelectedSubcategoryId(sel.subcategoryId);
    setSelectedActivityId(sel.activityId);
    setImageEmoji(sel.emoji);
    setVenueSearchHint(sel.venueSearchHint);
    const cat = HOBBY_CATALOG.find(c => c.id === sel.categoryId);
    const sub = cat?.subcategories.find(s => s.id === sel.subcategoryId);
    if (sub) {
      if (sub.profile.suggestedDurationMin) setDuration(String(sub.profile.suggestedDurationMin));
      setMaxAttendees(String(sub.profile.groupSize.typical));
      if (sub.profile.canBeOnline && sub.profile.locationTypes.includes('online')) {
        setLocationType('online');
      } else {
        setLocationType('city');
      }
    }
  }, []);

  // Build category string for DB: "Category > Subcategory > Activity"
  const categoryString = [
    selectedCategory?.name,
    selectedSubcategory?.name,
    selectedActivity?.name,
  ].filter(Boolean).join(' › ');


const hasRequiredLocation = useMemo(() => {
  if (locationType === 'online') return true;
  if (locationType === 'free') return Boolean(locationFreeText.trim());
  return Boolean(locationCity.trim() || locationAddress.trim());
}, [locationType, locationFreeText, locationCity, locationAddress]);

const hasRequiredFields = Boolean(
  user &&
  title.trim() &&
  selectedCategoryId &&
  selectedSubcategoryId &&
  eventDate &&
  eventTime &&
  hasRequiredLocation
);

const isDirty = useMemo(() => Boolean(
  title.trim() ||
  description.trim() ||
  selectedCategoryId ||
  selectedSubcategoryId ||
  selectedActivityId ||
  locationCity.trim() ||
  locationAddress.trim() ||
  locationFreeText.trim() ||
  tags.trim() ||
  meetingInstructions.trim() ||
  equipmentRequired.trim() ||
  accessibilityInfo.trim() ||
  costDetails.trim() ||
  cancellationPolicy.trim()
), [title, description, selectedCategoryId, selectedSubcategoryId, selectedActivityId, locationCity, locationAddress, locationFreeText, tags, meetingInstructions, equipmentRequired, accessibilityInfo, costDetails, cancellationPolicy]);

const handleRequestClose = useCallback(() => {
  if (isDirty && !loading) {
    toast.warning('Az ablakban kitöltött adatok vannak. A bezáráshoz használd újra a Bezárás gombot, ha biztos vagy benne.');
  }
  onClose();
}, [isDirty, loading, onClose]);

const handleBackdropClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
  if (event.target !== event.currentTarget) return;
  if (isDirty) {
    toast.info('Az eseménylétrehozó nem záródott be, mert már vannak kitöltött mezők.');
    return;
  }
  onClose();
}, [isDirty, onClose]);

useEffect(() => {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = previousOverflow;
  };
}, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasRequiredFields || !user) return;

    setLoading(true);
    try {
      const eventInsertPayload = buildEventInsertPayload({
        userId: user.id,
        title,
        description,
        category: categoryString,
        eventDate,
        eventTime,
        expectedEndTime,
        locationType,
        locationCity,
        locationDistrict,
        locationAddress,
        locationFreeText,
        locationLat,
        locationLon,
        maxAttendees,
        imageEmoji,
        tags,
        placeData,
        meetingInstructions,
        beginnerFriendly,
        activityIntensity,
        equipmentRequired,
        accessibilityInfo,
        costDetails,
        cancellationPolicy,
        waitlistEnabled,
        visibilityType,
        privateLocationRevealHours,
      });
      let createdEvent: Awaited<ReturnType<typeof createEventRecord>>;
      try {
        createdEvent = await createEventRecord(eventInsertPayload);
      } catch {
        console.warn('[create_event] insert_failed', { errorCode: 'CREATE_EVENT_FAILED' });
        toast.error('Hiba az esemény létrehozásakor. Ellenőrizd a kötelező mezőket és próbáld újra.');
        return;
      }

      const eventId = createdEvent.id;

      let circleLinked = !circleId;
      if (circleId) {
        try {
          await linkEventToCircle(circleId, eventId);
          circleLinked = true;
        } catch {
          console.warn('[create_event] circle_link_failed', { errorCode: 'CIRCLE_EVENT_LINK_FAILED' });
          toast.warning('Az esemény létrejött, de nem sikerült a Circle-höz kapcsolni. A Circle részleteinél újra próbálhatod.');
        }
      }
      try {
        await upsertEventTripPlan(eventId, tripPlan);
      } catch {
        console.warn('[create_event] trip_plan_save_failed', { errorCode: 'TRIP_PLAN_SAVE_FAILED' });
        toast.error('Az esemény létrejött, de az útvonalterv mentése nem sikerült.');
      }
      if (createdEvent.organizerReadinessRequired && !createdEvent.isActive) {
        toast.info('Az esemény biztonságos piszkozatként létrejött. A Szervezői központ readiness ellenőrzése után publikálható.');
      } else {
        toast.success(circleId && circleLinked ? 'A Circle eseménye sikeresen létrejött!' : 'Esemény sikeresen létrehozva!');
      }
      onCreated();
    } catch {
      console.warn('[create_event] flow_failed', { errorCode: 'CREATE_EVENT_FLOW_FAILED' });
      toast.error('Váratlan hiba történt létrehozás közben. A modal nyitva maradt, az adatok nem vesztek el.');
    } finally {
      setLoading(false);
    }
  };

  // The live drafts that feed the premium rail — readiness + "no surprise"
  // preview — rebuilt on every keystroke from the fields already in state.
  const readinessDraft: ReadinessDraft = useMemo(() => ({
    title, description, category: selectedCategory?.name ?? '',
    hasDate: Boolean(eventDate), eventTime,
    hasLocation: locationType === 'free' ? Boolean(locationFreeText.trim()) : Boolean(locationCity.trim() || locationAddress.trim()),
    imageEmoji, maxAttendees, beginnerFriendly, activityIntensity, equipmentRequired, tags,
  }), [title, description, selectedCategory, eventDate, eventTime, locationType, locationFreeText,
    locationCity, locationAddress, imageEmoji, maxAttendees, beginnerFriendly, activityIntensity, equipmentRequired, tags]);

  const previewDraft = useMemo(() => ({
    title, emoji: imageEmoji, category: selectedCategory?.name ?? '',
    dateLabel: eventDate ? eventDate.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', weekday: 'short' }) : null,
    timeLabel: eventTime || null,
    locationLabel: [locationCity, locationAddress, locationFreeText].map((s) => s.trim()).filter(Boolean)[0] || null,
    description, maxAttendees,
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
  }), [title, imageEmoji, selectedCategory, eventDate, eventTime, locationCity, locationAddress, locationFreeText, description, maxAttendees, tags]);

  return (
    <CreateEventErrorBoundary onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-foreground/25 p-4 backdrop-blur-sm" onClick={handleBackdropClick}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}
        role="dialog" aria-modal="true" aria-labelledby="create-event-title"
        className="max-h-[90vh] w-full max-w-5xl overscroll-contain overflow-y-auto rounded-[1.75rem] border border-border/75 bg-card p-5 shadow-modal sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarPlus className="h-5 w-5 text-primary" />
            </div>
            <h3 id="create-event-title" className="font-display text-lg font-bold">Új esemény létrehozása</h3>
          </div>
          <Button aria-label="Eseménylétrehozó bezárása" variant="ghost" size="icon" onClick={handleRequestClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        {/* The premium rail: attendee preview + live readiness. First in the DOM
            so it sits at the top on mobile, ordered to the right on desktop. */}
        <aside className="order-first mb-4 space-y-4 lg:order-last lg:mb-0 lg:sticky lg:top-2">
          <EventLivePreview draft={previewDraft} />
          {(() => {
            // A gentle copilot: one emoji that fits, a few tag ideas. Deterministic,
            // no AI cost — one tap applies it. Shown only when it has something to add.
            const catName = selectedCategory?.name ?? '';
            const emojiPick = catName || title ? suggestEmoji(catName, title) : null;
            const tagPicks = catName ? suggestTags(catName, tags) : [];
            const showEmoji = emojiPick && emojiPick !== imageEmoji;
            if (!showEmoji && tagPicks.length === 0) return null;
            return (
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Ötletek egy kattintásra</p>
                <div className="flex flex-wrap gap-1.5">
                  {showEmoji && (
                    <button type="button" onClick={() => setImageEmoji(emojiPick)}
                      className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-sm transition-colors hover:border-primary/50">
                      {emojiPick} emoji
                    </button>
                  )}
                  {tagPicks.map((tag) => (
                    <button key={tag} type="button"
                      onClick={() => setTags((current) => (current.trim() ? `${current.replace(/,\s*$/, '')}, ${tag}` : tag))}
                      className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary/50">
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <EventReadinessMeter draft={readinessDraft} />
        </aside>

        <form onSubmit={handleCreate} className="space-y-4 lg:order-first">
          {/* Template selector + Save as template */}
          <div className="flex flex-wrap items-center gap-2">
            <EventTemplateSelector onSelect={(tpl) => {
              const next = applyEventTemplateToDraft({
                selectedCategoryId,
                selectedSubcategoryId,
                selectedActivityId,
                description,
                imageEmoji,
                tags,
                locationType,
                locationCity,
                locationDistrict,
                locationAddress,
                locationFreeText,
                hasManualLocation: Boolean(locationCity || locationDistrict || locationAddress || locationFreeText || placeData),
                maxAttendees,
                eventTime,
                beginnerFriendly,
                activityIntensity,
                equipmentRequired,
              }, tpl);
              setSelectedCategoryId(next.selectedCategoryId);
              setSelectedSubcategoryId(next.selectedSubcategoryId);
              setSelectedActivityId(next.selectedActivityId);
              setDescription(next.description);
              setImageEmoji(next.imageEmoji);
              setTags(next.tags);
              setLocationType(next.locationType);
              setLocationCity(next.locationCity);
              setLocationDistrict(next.locationDistrict);
              setLocationAddress(next.locationAddress);
              setLocationFreeText(next.locationFreeText);
              setMaxAttendees(next.maxAttendees);
              setEventTime(next.eventTime);
              setBeginnerFriendly(next.beginnerFriendly);
              setActivityIntensity(next.activityIntensity);
              setEquipmentRequired(next.equipmentRequired);
              toast.info(`Sablon betöltve: ${tpl.template_name}`);
            }} />
            <SaveAsTemplateButton
              category={categoryString}
              description={description}
              imageEmoji={imageEmoji}
              tags={tags}
              locationType={locationType}
              locationCity={locationCity}
              locationDistrict={locationDistrict}
              locationAddress={locationAddress}
              locationFreeText={locationFreeText}
              maxAttendees={maxAttendees}
              eventTime={eventTime}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esemény neve *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="pl. Vasárnapi futás" required className="rounded-xl h-11" />
          </div>

          {/* Quick activity search */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gyorskeresés tevékenységre</Label>
            <ActivityAutocomplete
              onSelect={handleActivityAutocomplete}
              value={selectedActivity ? `${selectedActivity.emoji || ''} ${selectedActivity.name}`.trim() : ''}
            />
            <p className="text-xs text-muted-foreground">Írd be a tevékenység nevét (pl. sakkozás, futás, jóga) – vagy válassz lentebb a kategóriákból.</p>
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

          {/* Venue suggestions button – appears after activity selection */}
          {venueSearchHint && (
            <VenueSuggestionsPanel
              activityHint={venueSearchHint}
              circleId={circleId}
              bias={locationLat && locationLon ? { lat: locationLat, lon: locationLon } : undefined}
              cityName={locationCity || undefined}
              onSelectVenue={(venue: VenueSelection) => {
                setLocationCity(venue.city);
                setLocationDistrict(venue.district);
                setLocationAddress(venue.address || venue.displayName);
                setLocationFreeText('');
                setLocationLat(venue.lat);
                setLocationLon(venue.lon);
                setPlaceData({
                  displayName: venue.displayName,
                  city: venue.city,
                  district: venue.district,
                  address: venue.address,
                  lat: venue.lat,
                  lon: venue.lon,
                  placeId: venue.placeId,
                  source: venue.source,
                  categories: venue.categories,
                });
                setLocationType('address');
              }}
            />
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leírás (max. 300 karakter)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 300))} placeholder="Részletek..." className="rounded-xl" maxLength={300} />
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

          <CreateEventExpectationsFields
            meetingInstructions={meetingInstructions}
            expectedEndTime={expectedEndTime}
            beginnerFriendly={beginnerFriendly}
            activityIntensity={activityIntensity}
            equipmentRequired={equipmentRequired}
            accessibilityInfo={accessibilityInfo}
            costDetails={costDetails}
            cancellationPolicy={cancellationPolicy}
            waitlistEnabled={waitlistEnabled}
            visibilityType={visibilityType}
            privateLocationRevealHours={privateLocationRevealHours}
            onMeetingInstructionsChange={setMeetingInstructions}
            onExpectedEndTimeChange={setExpectedEndTime}
            onBeginnerFriendlyChange={setBeginnerFriendly}
            onActivityIntensityChange={setActivityIntensity}
            onEquipmentRequiredChange={setEquipmentRequired}
            onAccessibilityInfoChange={setAccessibilityInfo}
            onCostDetailsChange={setCostDetails}
            onCancellationPolicyChange={setCancellationPolicy}
            onWaitlistEnabledChange={setWaitlistEnabled}
            onVisibilityTypeChange={setVisibilityType}
            onPrivateLocationRevealHoursChange={setPrivateLocationRevealHours}
          />

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
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín típusa *</Label>
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
                placeholder={venueSearchHint ? `Keress helyszínt: ${venueSearchHint}...` : 'Keress rá egy helyszínre...'}
                activityHint={venueSearchHint}
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

          {!hasRequiredFields && (
            <p className="text-xs text-muted-foreground">A *-gal jelölt mezők kötelezőek. Az esemény létrehozása csak kitöltés után engedélyezett.</p>
          )}

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold"
            disabled={loading || !hasRequiredFields}>
            {loading ? 'Létrehozás...' : 'Esemény létrehozása'}
          </Button>
        </form>
        </div>
      </motion.div>
    </div>
    </CreateEventErrorBoundary>
  );
}
