import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Loader2, MapPin, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createExternalEventCompanionPlan,
  getExternalEventCompanionPlan,
  setExternalEventCompanionMembership,
  type ExternalEventCompanionState,
} from '@/lib/eventOperations';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

interface ExternalEventCompanionCardProps {
  externalEventId: string;
  eventTitle: string;
  eventDate: string | null;
  eventTime: string | null;
  /** Venue or address of the original program — the meeting point prefill. */
  venueHint: string | null;
  sourceLabel: string;
  authenticated: boolean;
  onRequestSignIn: () => void;
  /** Offer the plan straight away when someone lands here from the map. */
  autoPrompt?: boolean;
  /** "Nem" — take them back where they came from. */
  onDecline?: () => void;
}

type DialogView = 'closed' | 'offer' | 'form';

function timeForInput(value: string | null) {
  if (!value) return '';
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : '';
}

function formatMeetTime(value: string | null) {
  const short = timeForInput(value);
  return short ? `${short}-kor` : null;
}

const ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: 'Ehhez be kell jelentkezned.',
  FEATURE_DISABLED: 'A közös látogatás funkció épp szünetel.',
  EXTERNAL_EVENT_NOT_AVAILABLE: 'Ez a program már nem elérhető, vagy túl régi az adata.',
  COMPANION_PLAN_NOT_FOUND: 'Ez a közös látogatás időközben megszűnt.',
  COMPANION_PLAN_FULL: 'Ez a társaság már betelt.',
  USER_SUSPENDED: 'A fiókodra vonatkozó korlátozás miatt ez most nem elérhető.',
};

export function ExternalEventCompanionCard({
  externalEventId,
  eventTitle,
  eventDate,
  eventTime,
  venueHint,
  sourceLabel,
  authenticated,
  onRequestSignIn,
  autoPrompt = false,
  onDecline,
}: ExternalEventCompanionCardProps) {
  const [state, setState] = useState<ExternalEventCompanionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DialogView>('closed');
  const promptedFor = useRef<string | null>(null);

  const [meetingPoint, setMeetingPoint] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await getExternalEventCompanionPlan(externalEventId));
    } catch {
      setError('A közös látogatás állapota most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, [externalEventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Prefill everything we already know, so the only real decision left is
  // "where do we meet".
  useEffect(() => {
    setMeetingPoint(venueHint ? venueHint.slice(0, 160) : '');
    setMeetTime(timeForInput(eventTime));
    setNote('');
  }, [venueHint, eventTime, externalEventId]);

  const plan = state?.plan ?? null;
  const usable = Boolean(state?.featureEnabled && state?.available);

  // The offer is made once per program per session: helpful on arrival,
  // not a popup that reappears every time you come back to the page.
  useEffect(() => {
    if (!autoPrompt || loading || plan || !usable) return;
    if (promptedFor.current === externalEventId) return;
    const seenKey = `companion-offer-${externalEventId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(seenKey)) return;
    promptedFor.current = externalEventId;
    try { sessionStorage.setItem(seenKey, '1'); } catch { /* private mode */ }
    setView('offer');
  }, [autoPrompt, loading, plan, usable, externalEventId]);

  const dateLabel = useMemo(() => {
    if (!eventDate) return null;
    try {
      return new Date(`${eventDate}T00:00:00`).toLocaleDateString('hu-HU', {
        month: 'long', day: 'numeric', weekday: 'long',
      });
    } catch {
      return eventDate;
    }
  }, [eventDate]);

  const requireSignIn = () => {
    setView('closed');
    onRequestSignIn();
  };

  const openCreate = () => {
    if (!authenticated) { requireSignIn(); return; }
    setView('form');
  };

  const decline = () => {
    setView('closed');
    onDecline?.();
  };

  const handleCreate = async () => {
    if (!authenticated) { requireSignIn(); return; }
    setSaving(true);
    setError(null);
    try {
      const next = await createExternalEventCompanionPlan({
        externalEventId,
        meetingPoint: meetingPoint.trim() || null,
        meetTime: meetTime || null,
        note: note.trim() || null,
      });
      setState(next);
      setView('closed');
      // Reuses the registered external-social event; the variant separates a
      // companion plan from a plain interest signal.
      void trackProductEvent('external_social_intent', {
        event_id: externalEventId,
        variant: 'companion_plan',
        status: 'created',
        surface: 'external_event_detail',
      });
    } catch (createError) {
      const code = createError instanceof Error ? createError.message : '';
      setError(ERROR_TEXT[code] || 'A közös látogatást nem sikerült létrehozni. Próbáld újra.');
    } finally {
      setSaving(false);
    }
  };

  const handleMembership = async (active: boolean) => {
    if (!authenticated) { requireSignIn(); return; }
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const next = await setExternalEventCompanionMembership({ planId: plan.id, active });
      setState(next);
      void trackProductEvent('external_social_intent', {
        event_id: externalEventId,
        variant: 'companion_plan',
        status: active ? 'joined' : 'left',
        surface: 'external_event_detail',
      });
    } catch (membershipError) {
      const code = membershipError instanceof Error ? membershipError.message : '';
      setError(ERROR_TEXT[code] || 'A művelet nem sikerült. Próbáld újra.');
    } finally {
      setSaving(false);
    }
  };

  if (state && !state.available) return null;

  return (
    <>
      <Card className="mt-6 rounded-[1.75rem] border-primary/20 bg-primary/[0.04] shadow-lg shadow-primary/[0.04]" aria-labelledby="companion-title">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="companion-title" className="font-display text-lg font-semibold">Menjünk el együtt!</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                A programot a(z) {sourceLabel} szervezi. A Hobbeaston csak egy közös látogatás
                szerveződik hozzá – nem hozunk létre külön eseményt belőle.
              </p>
            </div>
          </div>

          {loading ? (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
            </p>
          ) : state && !state.featureEnabled ? (
            <p role="status" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              A közös látogatás funkció fokozatos bevezetés alatt áll; a program eredeti oldala
              addig is elérhető.
            </p>
          ) : plan ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                  <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" /> Közös látogatás
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {plan.companionCount} hobbeastos tag megy együtt
                  {plan.spotsLeft !== null && ` · még ${plan.spotsLeft} hely`}
                </span>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Találkozó</dt>
                    <dd className="font-medium">{plan.meetingPoint || 'A helyszínen'}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mikor</dt>
                    <dd className="font-medium">
                      {[dateLabel, formatMeetTime(plan.meetTime)].filter(Boolean).join(', ') || 'A program szerint'}
                    </dd>
                  </div>
                </div>
              </dl>
              {plan.note && <p className="whitespace-pre-line rounded-xl bg-card/80 p-3 text-sm">{plan.note}</p>}
              <p className="text-xs text-muted-foreground">Szervezi: {plan.hostName}</p>

              <div className="flex flex-wrap gap-2">
                {plan.isHost ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
                    disabled={saving}
                    onClick={() => void handleMembership(false)}
                  >
                    Közös látogatás visszavonása
                  </Button>
                ) : plan.iJoined ? (
                  <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={() => void handleMembership(false)}>
                    Mégsem megyek
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow"
                    disabled={saving || plan.spotsLeft === 0}
                    onClick={() => void handleMembership(true)}
                  >
                    {plan.spotsLeft === 0 ? 'Betelt a társaság' : 'Én is megyek'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Erre a programra még senki nem szervezett közös látogatást. Te lehetsz az első –
                utána a többi érdeklődő már csatlakozni tud hozzád.
              </p>
              <Button
                type="button"
                className="rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow"
                onClick={openCreate}
              >
                Közös látogatást szervezek
              </Button>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            A jegyvásárlás és a részvétel továbbra is a program eredeti oldalán történik. A többi
            jelentkező neve nem látszik, csak a létszám és a szervező neve.
          </p>
        </CardContent>
      </Card>

      <Dialog open={view !== 'closed'} onOpenChange={(open) => { if (!open) setView('closed'); }}>
        <DialogContent className="max-w-lg">
          {view === 'offer' ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Ehhez a programhoz még nincs közös látogatás</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-left">
                    <p>
                      A(z) <strong className="text-foreground">{eventTitle}</strong> egy külső program,
                      és még senki nem jelezte, hogy társaságban menne el rá.
                    </p>
                    <p>
                      Szeretnél szervezni egyet, hogy a többi érdeklődővel együtt menjetek? Nem lesz belőle
                      külön esemény: a Hobbeast csak egy találkozót tesz a program mellé.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-full" onClick={decline}>
                  Most nem, vissza a térképre
                </Button>
                <Button
                  type="button"
                  className="rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow"
                  onClick={openCreate}
                >
                  Igen, szervezzünk egyet!
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Közös látogatás – {eventTitle}</DialogTitle>
                <DialogDescription asChild>
                  <div className="text-left">
                    <p>
                      A program adatait már behúztuk: {[dateLabel, formatMeetTime(eventTime)].filter(Boolean).join(', ') || 'a megadott időpont'}
                      {venueHint ? `, ${venueHint}` : ''}. Csak nézd át, hol találkozzatok.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="companion-meeting-point">Hol találkozzatok?</Label>
                  <Input
                    id="companion-meeting-point"
                    value={meetingPoint}
                    maxLength={160}
                    placeholder="pl. a főbejárat előtt"
                    onChange={(event) => setMeetingPoint(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companion-meet-time">Hánykor?</Label>
                  <Input
                    id="companion-meet-time"
                    type="time"
                    value={meetTime}
                    onChange={(event) => setMeetTime(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">A program kezdési idejét ajánlottuk fel.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companion-note">Üzenet a többieknek (nem kötelező)</Label>
                  <Textarea
                    id="companion-note"
                    value={note}
                    maxLength={500}
                    rows={3}
                    placeholder="pl. Jegyet mindenki magának vesz, utána beülünk valahova."
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-full" onClick={() => setView('closed')} disabled={saving}>
                  Mégsem
                </Button>
                <Button
                  type="button"
                  className="rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow"
                  disabled={saving}
                  onClick={() => void handleCreate()}
                >
                  {saving ? 'Létrehozás…' : 'Kész, létrehozom'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
