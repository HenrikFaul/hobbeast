import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, HeartHandshake, ImagePlus, Loader2, Save, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { HOBBY_OPTIONS } from '@/features/identity/hobbyOptions';
import {
  buildAvailabilityWindow,
  boundedResumeStep,
  canSkipOnboardingStep,
  type HobbyExperienceLevel,
  ONBOARDING_STEP_COUNT,
  toggleBoundedChoice,
  validateOnboardingStep,
} from '@/features/identity/onboarding';
import {
  loadMyOnboardingPreferences,
  loadOnboardingCatalog,
  saveMyOnboardingProgress,
  type OnboardingActivityOption,
} from '@/features/identity/onboardingRepository';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import {
  buildFirstEventConfidencePayload,
  FIRST_EVENT_FORMAT_OPTIONS,
  firstEventConfidenceVisibilityLabel,
  normalizeFirstEventFormats,
  type FirstEventConfidenceVisibility,
  type FirstEventFormat,
} from '@/features/identity/firstEventConfidence';
import {
  loadMyFirstEventConfidence,
  saveMyFirstEventConfidence,
} from '@/features/identity/privacyRuntimeRepository';

const ACTIVITY_MODES = [
  ['one_to_one', 'Együtt egy másik emberrel'],
  ['small_group', 'Kisebb csoportban'],
  ['larger_group', 'Nagyobb társaságban'],
  ['online', 'Online alkalom is jöhet'],
] as const;

const AVAILABILITY_DAYS = [
  ['mon', 'H'], ['tue', 'K'], ['wed', 'Sze'], ['thu', 'Cs'],
  ['fri', 'P'], ['sat', 'Szo'], ['sun', 'V'],
] as const;

export default function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [city, setCity] = useState('');
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<OnboardingActivityOption[]>([]);
  const [experienceByHobby, setExperienceByHobby] = useState<Record<string, HobbyExperienceLevel | null>>({});
  const [activityModes, setActivityModes] = useState<string[]>([]);
  const [availabilityDays, setAvailabilityDays] = useState<string[]>([]);
  const [availabilityFrom, setAvailabilityFrom] = useState('18:00');
  const [availabilityTo, setAvailabilityTo] = useState('21:00');
  const [beginnerFriendly, setBeginnerFriendly] = useState<boolean | null>(null);
  const [firstEventFormats, setFirstEventFormats] = useState<FirstEventFormat[]>([]);
  const [confidenceVisibility, setConfidenceVisibility] = useState<FirstEventConfidenceVisibility>('private');
  const [confidenceTouched, setConfidenceTouched] = useState(false);
  const [clearConfidence, setClearConfidence] = useState(false);
  const [soloComfort, setSoloComfort] = useState('no_preference');
  const [groupSize, setGroupSize] = useState('no_preference');
  const [accessibilityNeeds, setAccessibilityNeeds] = useState('');
  const [communication, setCommunication] = useState('in_app');
  const [profileVisibility, setProfileVisibility] = useState('members');
  const [interestsVisibility, setInterestsVisibility] = useState('members');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [notificationConsent, setNotificationConsent] = useState(false);
  const onboardingStartedTracked = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?redirect=/onboarding', { replace: true });
      return;
    }
    const load = async () => {
      const [{ data, error }, catalogOptions, persistedPreferences, confidenceResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).single(),
        loadOnboardingCatalog(),
        loadMyOnboardingPreferences(),
        loadMyFirstEventConfidence(),
      ]);
      setCatalog(catalogOptions);
      setExperienceByHobby(Object.fromEntries(
        persistedPreferences.map((preference) => [preference.activity_name, preference.experience_level]),
      ));
      if (error) {
        toast.error('Az onboarding állapota nem tölthető be.');
      } else if (data) {
        if (data.onboarding_completed_at) {
          navigate('/events', { replace: true });
          return;
        }
        setStep(boundedResumeStep(data.onboarding_step));
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url || null);
        setCity(data.city || '');
        setHobbies(data.hobbies || []);
        setActivityModes(data.preferred_activity_modes || []);
        const availability = data.availability_window;
        if (availability && typeof availability === 'object' && !Array.isArray(availability)) {
          const availabilityRecord = availability as Record<string, unknown>;
          setAvailabilityDays(Array.isArray(availabilityRecord.days)
            ? availabilityRecord.days.filter((day): day is string => typeof day === 'string')
            : []);
          if (typeof availabilityRecord.from === 'string') setAvailabilityFrom(availabilityRecord.from);
          if (typeof availabilityRecord.to === 'string') setAvailabilityTo(availabilityRecord.to);
        }
        setBeginnerFriendly(data.beginner_friendly_preference);
        setSoloComfort(data.solo_arrival_comfort || 'no_preference');
        setGroupSize(data.preferred_group_size || 'no_preference');
        setAccessibilityNeeds(data.accessibility_needs || '');
        setCommunication(data.communication_preference || 'in_app');
        setProfileVisibility(data.profile_visibility || 'members');
        setInterestsVisibility(data.interests_visibility || 'members');
        setPrivacyAccepted(Boolean(data.privacy_consent_at));
        setNotificationConsent(Boolean(data.notification_consent_at));
        if (!confidenceResult.error && confidenceResult.data) {
          setFirstEventFormats(normalizeFirstEventFormats(confidenceResult.data.preferred_event_formats || []));
          setConfidenceVisibility(confidenceResult.data.visibility || 'private');
          if (confidenceResult.data.updated_at) setConfidenceTouched(true);
        }
        if (!onboardingStartedTracked.current) {
          onboardingStartedTracked.current = true;
          void trackProductEvent('onboarding_started', {
            surface: 'onboarding',
            status: data.onboarding_step > 0 ? 'resumed' : 'started',
          });
        }
      }
      setLoading(false);
    };
    void load();
  }, [authLoading, navigate, user]);

  const draft = useMemo(() => ({
    displayName,
    city,
    hobbies,
    activityModes,
    privacyAccepted,
  }), [activityModes, city, displayName, hobbies, privacyAccepted]);

  const interestOptions = useMemo(() => {
    const catalogNames = catalog.map((activity) => activity.name);
    return [...new Set([...(catalogNames.length > 0 ? catalogNames : [...HOBBY_OPTIONS]), ...hobbies])];
  }, [catalog, hobbies]);

  const catalogByName = useMemo(
    () => new Map(catalog.map((activity) => [activity.name, activity])),
    [catalog],
  );

  const uploadAvatar = async (file: File | null) => {
    if (!user || !file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      toast.error('Legfeljebb 5 MB-os képfájlt válassz.');
      return;
    }
    const extensionByMime: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByMime[file.type];
    if (!extension) {
      toast.error('JPG, PNG, WebP vagy GIF képet tölts fel.');
      return;
    }
    setAvatarUploading(true);
    const filePath = `${user.id}/onboarding-avatar.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      toast.error('Az avatár feltöltése sikertelen. Ezt a lépést kihagyhatod.');
    } else {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
      toast.success('Az avatár feltöltve.');
    }
    setAvatarUploading(false);
  };

  const persist = async (nextStep: number, complete: boolean) => {
    if (!user) return false;
    setSaving(true);
    const now = new Date().toISOString();
    const normalizedPreferences = hobbies.flatMap((hobby) => {
      const activity = catalogByName.get(hobby);
      return activity ? [{
        activity_id: activity.id,
        experience_level: experienceByHobby[hobby] || null,
      }] : [];
    });
    const { error } = await saveMyOnboardingProgress({
      display_name: displayName.trim(),
      avatar_url: avatarUrl,
      city: city.trim(),
      hobbies,
      activity_modes: activityModes,
      availability_window: buildAvailabilityWindow(availabilityDays, availabilityFrom, availabilityTo),
      normalized_preferences: normalizedPreferences,
      beginner_friendly: beginnerFriendly,
      solo_arrival_comfort: soloComfort,
      preferred_group_size: groupSize,
      accessibility_needs: accessibilityNeeds.trim(),
      communication_preference: communication,
      profile_visibility: profileVisibility,
      interests_visibility: interestsVisibility,
      privacy_accepted: privacyAccepted,
      notification_consent: notificationConsent,
    }, nextStep, complete);

    if (error) {
      toast.error('A folyamat mentése sikertelen. Az adataid nem vesztek el ezen az oldalon.');
      setSaving(false);
      return false;
    }

    if (confidenceTouched || clearConfidence) {
      const confidenceResult = await saveMyFirstEventConfidence(buildFirstEventConfidencePayload({
        preferredEventFormats: firstEventFormats,
        beginnerFriendly,
        soloArrivalComfort: soloComfort as 'prefer_buddy' | 'comfortable' | 'no_preference',
        preferredGroupSize: groupSize as 'small' | 'medium' | 'large' | 'no_preference',
        accessibilityNeeds,
        communicationPreference: communication as 'in_app' | 'email' | 'minimal',
        visibility: confidenceVisibility,
      }), clearConfidence);
      if (confidenceResult.error) {
        toast.error('Az onboarding mentve lett, de az opcionális első esemény beállítások nem. Próbáld újra.');
        setSaving(false);
        return false;
      }
      setClearConfidence(false);
    }

    if (complete) {
      void trackProductEvent('onboarding_completed', {
        surface: 'onboarding',
        status: 'completed',
        count_bucket: hobbies.length === 0 ? 'none' : hobbies.length < 3 ? 'one_to_two' : 'three_plus',
      });
      const { error: reconcileError } = await supabase.rpc('reconcile_virtual_hub_member', {
        _target_user_id: user.id,
        _idempotency_key: `onboarding:${user.id}:${now}`,
      });
      if (reconcileError) {
        toast.warning('A profil elkészült; a közösségi ajánlásokat később frissítjük.');
      }
    }
    setSaving(false);
    return true;
  };

  const skipStep = async () => {
    if (!(await persist(step + 1, false))) return;
    setStep((value) => Math.min(ONBOARDING_STEP_COUNT - 1, value + 1));
    toast.success('Ezt most kihagytad; a profilodban később pótolhatod.');
  };

  const continueLater = async () => {
    if (displayName.trim().length < 2) {
      toast.error('A későbbi folytatáshoz legalább a megjelenített nevedet add meg.');
      return;
    }
    if (!(await persist(step, false))) return;
    toast.success('Elmentettük. Innen folytathatod legközelebb.');
    navigate('/events', { replace: true });
  };

  const continueFlow = async () => {
    const errors = validateOnboardingStep(step, draft);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    const complete = step === ONBOARDING_STEP_COUNT - 1;
    const nextStep = complete ? ONBOARDING_STEP_COUNT : step + 1;
    if (!(await persist(nextStep, complete))) return;
    if (complete) {
      toast.success('Kész a profilod. Mutatjuk a hozzád illő programokat!');
      navigate('/events', { replace: true });
    } else {
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading || authLoading) {
    return <main className="grid min-h-screen place-items-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Betöltés" /></main>;
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">Profil indulás</span>
            <span className="text-muted-foreground">{step + 1}/{ONBOARDING_STEP_COUNT}</span>
          </div>
          <Progress value={((step + 1) / ONBOARDING_STEP_COUNT) * 100} aria-label="Onboarding folyamat" />
          <p className="text-sm text-muted-foreground">Bármikor visszatérhetsz: minden lépést külön mentünk.</p>
        </div>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 font-display">
              <HeartHandshake className="h-6 w-6 text-primary" />
              {['Alapok', 'Mi érdekel?', 'Hogyan kapcsolódnál?', 'Első esemény magabiztosan', 'Adatvédelmi kontroll'][step]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 0 && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="display-name">Megjelenített név</Label><Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="nickname" /></div>
                  <div className="space-y-2"><Label htmlFor="city">Város vagy környék <span className="font-normal text-muted-foreground">(opcionális)</span></Label><Input id="city" value={city} onChange={(event) => setCity(event.target.value)} maxLength={120} autoComplete="address-level2" /><p className="text-xs text-muted-foreground">Pontos címet nem kérünk; ezt később is megadhatod.</p></div>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
                  {avatarUrl ? <img src={avatarUrl} alt="A kiválasztott profilkép előnézete" className="h-16 w-16 rounded-full object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-muted"><ImagePlus className="h-6 w-6 text-muted-foreground" /></div>}
                  <div className="flex-1"><p className="font-medium">Profilkép <span className="font-normal text-muted-foreground">(opcionális)</span></p><p className="text-xs text-muted-foreground">JPG, PNG, WebP vagy GIF, legfeljebb 5 MB.</p></div>
                  <Button asChild type="button" variant="outline" disabled={avatarUploading}>
                    <label className="cursor-pointer">{avatarUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Kép választása<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadAvatar(event.target.files?.[0] || null)} /></label>
                  </Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Válassz legfeljebb 10 témát, vagy folytasd később. A tapasztalati szint opcionális és érdeklődésenként külön állítható.</p>
                <div className="flex flex-wrap gap-2">
                  {interestOptions.map((hobby) => {
                    const selected = hobbies.includes(hobby);
                    return <Button key={hobby} type="button" variant={selected ? 'default' : 'outline'} size="sm" aria-pressed={selected} onClick={() => {
                      const selecting = !selected;
                      setHobbies((values) => toggleBoundedChoice(values, hobby, 10));
                      if (selecting && hobbies.length < 10) void trackProductEvent('interest_selected', { surface: 'onboarding', count_bucket: hobbies.length < 2 ? 'one_to_two' : 'three_plus' });
                    }}>{selected && <Check className="mr-1 h-3.5 w-3.5" />}{hobby}</Button>;
                  })}
                </div>
                <p className="text-sm font-medium">{hobbies.length}/10 kiválasztva</p>
                {hobbies.length > 0 && <div className="grid gap-3 rounded-2xl bg-muted/30 p-4 sm:grid-cols-2">
                  {hobbies.map((hobby) => <div key={hobby} className="space-y-2"><Label htmlFor={`experience-${catalogByName.get(hobby)?.id || hobby}`}>{hobby} tapasztalat</Label><Select value={experienceByHobby[hobby] || 'not_shared'} onValueChange={(value) => setExperienceByHobby((current) => ({ ...current, [hobby]: value === 'not_shared' ? null : value as HobbyExperienceLevel }))}><SelectTrigger id={`experience-${catalogByName.get(hobby)?.id || hobby}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_shared">Nem adom meg</SelectItem><SelectItem value="new">Most próbálnám</SelectItem><SelectItem value="beginner">Kezdő</SelectItem><SelectItem value="intermediate">Középhaladó</SelectItem><SelectItem value="advanced">Haladó</SelectItem></SelectContent></Select></div>)}
                </div>}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <fieldset className="space-y-3"><legend className="font-medium">Preferált részvételi mód <span className="font-normal text-muted-foreground">(opcionális)</span></legend>{ACTIVITY_MODES.map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><Checkbox checked={activityModes.includes(value)} onCheckedChange={() => setActivityModes((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])} /><span>{label}</span></label>)}</fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Csoportméret</Label><Select value={groupSize} onValueChange={(value) => { setGroupSize(value); setConfidenceTouched(true); setClearConfidence(false); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Kisebb (3–8 fő)</SelectItem><SelectItem value="medium">Közepes (9–20 fő)</SelectItem><SelectItem value="large">Nagyobb</SelectItem><SelectItem value="no_preference">Mindegy</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Egyedül érkezés</Label><Select value={soloComfort} onValueChange={(value) => { setSoloComfort(value); setConfidenceTouched(true); setClearConfidence(false); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prefer_buddy">Jól jönne egy buddy</SelectItem><SelectItem value="comfortable">Kényelmesen érkezem egyedül</SelectItem><SelectItem value="no_preference">Nem szeretném megadni</SelectItem></SelectContent></Select></div>
                </div>
                <fieldset className="space-y-3 rounded-2xl border p-4"><legend className="px-1 font-medium">Mikor érsz rá általában? <span className="font-normal text-muted-foreground">(opcionális, privát)</span></legend><div className="flex flex-wrap gap-2">{AVAILABILITY_DAYS.map(([value, label]) => <Button key={value} type="button" size="sm" variant={availabilityDays.includes(value) ? 'default' : 'outline'} aria-pressed={availabilityDays.includes(value)} onClick={() => setAvailabilityDays((days) => days.includes(value) ? days.filter((day) => day !== value) : [...days, value])}>{label}</Button>)}</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="availability-from">Ettől</Label><Input id="availability-from" type="time" value={availabilityFrom} onChange={(event) => setAvailabilityFrom(event.target.value)} disabled={availabilityDays.length === 0} /></div><div className="space-y-2"><Label htmlFor="availability-to">Eddig</Label><Input id="availability-to" type="time" value={availabilityTo} onChange={(event) => setAvailabilityTo(event.target.value)} disabled={availabilityDays.length === 0} /></div></div></fieldset>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <fieldset className="space-y-3"><legend className="font-medium">Milyen első alkalom segítene? <span className="font-normal text-muted-foreground">(opcionális)</span></legend><div className="flex flex-wrap gap-2">{FIRST_EVENT_FORMAT_OPTIONS.map((option) => { const selected = firstEventFormats.includes(option.value); return <Button key={option.value} type="button" size="sm" variant={selected ? 'default' : 'outline'} aria-pressed={selected} onClick={() => { setFirstEventFormats((formats) => normalizeFirstEventFormats(selected ? formats.filter((format) => format !== option.value) : [...formats, option.value])); setConfidenceTouched(true); setClearConfidence(false); }}>{option.label}</Button>; })}</div></fieldset>
                <label className="flex items-center justify-between gap-4 rounded-xl border p-4"><span><span className="block font-medium">Kezdőbarát eseményeket mutass előbb</span><span className="text-sm text-muted-foreground">Ez ajánlási preferencia, nem nyilvános címke.</span></span><Switch checked={Boolean(beginnerFriendly)} onCheckedChange={(checked) => { setBeginnerFriendly(checked); setConfidenceTouched(true); setClearConfidence(false); }} /></label>
                <div className="space-y-2"><Label htmlFor="accessibility">Hozzáférhetőségi igény (opcionális)</Label><Textarea id="accessibility" value={accessibilityNeeds} onChange={(event) => { setAccessibilityNeeds(event.target.value); setConfidenceTouched(true); setClearConfidence(false); }} maxLength={500} placeholder="Csak azt oszd meg, ami a részvétel szervezéséhez szükséges." /></div>
                <div className="space-y-2"><Label>Kapcsolattartás</Label><Select value={communication} onValueChange={(value) => { setCommunication(value); setConfidenceTouched(true); setClearConfidence(false); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in_app">Alkalmazáson belül</SelectItem><SelectItem value="email">E-mail is</SelectItem><SelectItem value="minimal">Csak fontos változások</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Láthatóság</Label><Select value={confidenceVisibility} onValueChange={(value: FirstEventConfidenceVisibility) => { setConfidenceVisibility(value); setConfidenceTouched(true); setClearConfidence(false); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Privát</SelectItem><SelectItem value="event_host_after_join">Csatlakozás után az esemény hostja</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">{firstEventConfidenceVisibilityLabel(confidenceVisibility)}</p></div>
                <Button type="button" variant="ghost" onClick={() => { setFirstEventFormats([]); setBeginnerFriendly(null); setSoloComfort('no_preference'); setGroupSize('no_preference'); setAccessibilityNeeds(''); setCommunication('in_app'); setConfidenceVisibility('private'); setConfidenceTouched(false); setClearConfidence(true); }}>Opcionális első esemény adatok törlése</Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Profil láthatósága</Label><Select value={profileVisibility} onValueChange={setProfileVisibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Privát</SelectItem><SelectItem value="members">Csak bejelentkezett tagok</SelectItem><SelectItem value="public">Nyilvános</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Érdeklődések láthatósága</Label><Select value={interestsVisibility} onValueChange={setInterestsVisibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Privát</SelectItem><SelectItem value="members">Csak tagok</SelectItem><SelectItem value="public">Nyilvános</SelectItem></SelectContent></Select></div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border p-4"><Checkbox id="privacy-accepted" checked={privacyAccepted} onCheckedChange={(checked) => setPrivacyAccepted(Boolean(checked))} /><div className="text-sm"><Label htmlFor="privacy-accepted" className="font-bold">Elfogadom az adatkezelési tájékoztatót.</Label><span className="mt-1 block text-muted-foreground">A pontos helyadat és az opcionális első-esemény preferenciák nem kerülnek nyilvános profilba. <Link to="/legal#adatkezeles" className="font-semibold text-foreground underline underline-offset-2">Tájékoztató megnyitása</Link></span></div></div>
                <label className="flex items-start gap-3 rounded-xl border p-4"><Checkbox checked={notificationConsent} onCheckedChange={(checked) => setNotificationConsent(Boolean(checked))} /><span className="text-sm"><strong>Kérek hasznos programértesítéseket.</strong><span className="mt-1 block text-muted-foreground">Opcionális; csendes idővel és gyakorisággal később szabályozható.</span></span></label>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" disabled={step === 0 || saving} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="mr-2 h-4 w-4" />Vissza</Button><Button type="button" variant="ghost" disabled={saving || avatarUploading} onClick={() => void continueLater()}><Save className="mr-2 h-4 w-4" />Folytatom később</Button></div>
              <div className="flex flex-col gap-2 sm:flex-row">{canSkipOnboardingStep(step) && <Button type="button" variant="outline" disabled={saving || avatarUploading} onClick={() => void skipStep()}><SkipForward className="mr-2 h-4 w-4" />Most kihagyom</Button>}<Button type="button" disabled={saving || avatarUploading} onClick={() => void continueFlow()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : step === ONBOARDING_STEP_COUNT - 1 ? <Check className="mr-2 h-4 w-4" /> : <ArrowRight className="mr-2 h-4 w-4" />}{step === ONBOARDING_STEP_COUNT - 1 ? 'Befejezés' : 'Mentés és tovább'}</Button></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
