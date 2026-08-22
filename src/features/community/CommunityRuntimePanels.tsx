import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Check, ChevronRight, Loader2, RotateCcw, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  acceptCommunityCircleSuggestion,
  claimVirtualHubHost,
  leaveCommunityCircle,
  loadCircleDetail,
  loadCircleHealth,
  loadVirtualHubHostInsights,
  loadVirtualHubModerationQueue,
  loadVirtualHubPendingRequests,
  loadVirtualHubWelcome,
  recordVirtualHubPreview,
  requestVirtualHubReactivation,
  resolveCircleMembershipRequest,
  resolveVirtualHubJoinRequest,
  resolveVirtualHubModerationItem,
} from './repository';
import type {
  CircleCard,
  CircleDetail,
  CircleHealth,
  CircleSuggestionCard,
  HubCard,
  HubHostInsights,
  HubModerationItem,
  HubPendingRequest,
  HubWelcome,
} from './contracts';

interface RuntimeActionProps {
  userId: string;
  onChanged: () => Promise<void>;
}

export function CircleSuggestionCards({
  suggestions,
  onChanged,
}: {
  suggestions: CircleSuggestionCard[];
  onChanged: () => Promise<void>;
}) {
  const [workingId, setWorkingId] = useState<string | null>(null);
  if (suggestions.length === 0) return null;

  const accept = async (suggestion: CircleSuggestionCard) => {
    setWorkingId(suggestion.suggestion_id);
    const result = await acceptCommunityCircleSuggestion(suggestion.suggestion_id, suggestion.activity_label);
    if (!result.ok) toast.error('A Circle-javaslat most nem aktiválható.');
    else {
      toast.success('A Circle létrejött, a meghívások elkészültek.');
      await onChanged();
    }
    setWorkingId(null);
  };

  return <section aria-labelledby="circle-suggestions-title" className="space-y-3 rounded-2xl border bg-primary/5 p-4">
    <div><h2 id="circle-suggestions-title" className="font-semibold">Ismét találkoznátok?</h2><p className="text-sm text-muted-foreground">Csak legalább két, ismételt és hitelesített közös eseménykapcsolatból készítünk javaslatot.</p></div>
    <div className="grid gap-3 md:grid-cols-2">{suggestions.map((suggestion) => <div key={suggestion.suggestion_id} className="rounded-xl bg-background p-4 shadow-sm"><div className="flex flex-wrap items-center gap-2"><Badge>{suggestion.activity_label}</Badge>{suggestion.city && <Badge variant="outline">{suggestion.city}</Badge>}</div><p className="mt-3 text-sm">{suggestion.suggested_member_count} korábbi kapcsolat meghívható egy közös Circle-be.</p><Button type="button" className="mt-4" size="sm" disabled={workingId === suggestion.suggestion_id} onClick={() => void accept(suggestion)}>{workingId === suggestion.suggestion_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Circle indítása</Button></div>)}</div>
  </section>;
}

export function CircleRuntimeActions({
  circle,
  membershipStatus,
  userId,
  onChanged,
}: RuntimeActionProps & {
  circle: CircleCard;
  membershipStatus: string | undefined;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CircleDetail | null>(null);
  const [health, setHealth] = useState<CircleHealth | null>(null);
  const [healthUnavailable, setHealthUnavailable] = useState(false);

  const openDetail = async () => {
    setOpen(true);
    setLoading(true);
    setHealthUnavailable(false);
    const [result, healthResult] = await Promise.all([
      loadCircleDetail(circle.id),
      circle.host_id === userId ? loadCircleHealth(circle.id) : Promise.resolve(null),
    ]);
    if (!result.ok || !result.data) toast.error('A Circle részletei most nem tölthetők be.');
    else setDetail(result.data);
    if (healthResult) {
      if (!healthResult.ok || !healthResult.data) setHealthUnavailable(true);
      else setHealth(healthResult.data);
    }
    setLoading(false);
  };

  const resolveRequest = async (requestedUserId: string, approve: boolean) => {
    setWorkingId(requestedUserId);
    const result = await resolveCircleMembershipRequest(circle.id, requestedUserId, approve);
    if (!result.ok) toast.error('A tagsági kérés nem zárható le.');
    else {
      toast.success(approve ? 'A tagsági kérést jóváhagytad.' : 'A tagsági kérést elutasítottad.');
      const refreshed = await loadCircleDetail(circle.id);
      if (refreshed.ok) setDetail(refreshed.data);
      await onChanged();
    }
    setWorkingId(null);
  };

  const leave = async () => {
    if (!window.confirm('Biztosan elhagyod ezt a Circle-t? A korábbi részvételed auditált előzménye megmarad.')) return;
    setWorkingId('leave');
    const result = await leaveCommunityCircle(circle.id);
    if (!result.ok) toast.error('A Circle most nem hagyható el. Hostként előbb másik hostot kell kijelölni.');
    else {
      toast.success('Elhagytad a Circle-t.');
      setOpen(false);
      await onChanged();
    }
    setWorkingId(null);
  };

  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => void openDetail()}>Részletek<ChevronRight className="ml-1 h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{circle.name}</DialogTitle><DialogDescription>Tagok, közös cél, következő program és host által kezelhető tagsági kérések.</DialogDescription></DialogHeader>
      {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Circle részletek betöltése" /></div> : detail ? <div className="space-y-5">
        <div className="rounded-xl bg-muted/40 p-4"><p>{detail.purpose}</p><div className="mt-3 flex flex-wrap gap-2"><Badge>{detail.lifecycle_state}</Badge><Badge variant="outline">{detail.cadence}</Badge><Badge variant="outline">{detail.members.length}/{detail.capacity} tag</Badge></div></div>
        {detail.host_id === userId && health && <section aria-labelledby={`circle-health-${circle.id}`} className="space-y-3 rounded-xl border p-4"><div><h3 id={`circle-health-${circle.id}`} className="font-medium">Circle health</h3><p className="text-xs text-muted-foreground">Csoportszintű, nem diagnosztikus működési mutatók.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-2xl font-semibold">{health.new_members_30d}</p><p className="text-xs text-muted-foreground">új tag / 30 nap</p></div><div><p className="text-2xl font-semibold">{Math.round(health.returning_rate * 100)}%</p><p className="text-xs text-muted-foreground">visszatérési arány</p></div><div><p className="text-2xl font-semibold">{Math.round(health.no_show_rate * 100)}%</p><p className="text-xs text-muted-foreground">no-show arány</p></div><div><p className="text-2xl font-semibold">{health.host_load}</p><p className="text-xs text-muted-foreground">nyitott host feladat</p></div></div><div className="flex flex-wrap gap-2"><Badge variant={health.cadence_status === 'on_track' ? 'default' : 'secondary'}>{health.cadence_status === 'on_track' ? 'Ritmus rendben' : health.cadence_status === 'no_events' ? 'Még nincs esemény' : 'Ritmus figyelmet kér'}</Badge><Badge variant="outline">{health.events_30d} esemény / 30 nap</Badge><Badge variant="outline">{health.reports_30d} jelzés / 30 nap</Badge></div></section>}
        {detail.host_id === userId && healthUnavailable && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground" role="status">A Circle health mutatók most nem érhetők el; a tagsági műveletek ettől tovább használhatók.</p>}
        {(detail.shared_interests || []).length > 0 && <section className="space-y-2"><h3 className="font-medium">Közös érdeklődések</h3><div className="flex flex-wrap gap-2">{(detail.shared_interests || []).map((interest) => <Badge key={interest.label} variant="secondary">{interest.label} · {interest.member_count} tag</Badge>)}</div><p className="text-xs text-muted-foreground">Csak legalább két, erre láthatóságot adó tag közös érdeklődése jelenik meg.</p></section>}
        {detail.next_event ? <div className="rounded-xl border p-4"><p className="font-medium">Következő közös program</p><p className="text-sm text-muted-foreground">{detail.next_event.title} · {detail.next_event.event_date || 'időpont egyeztetés alatt'}</p><Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => navigate(`/events/${detail.next_event?.event_id}`)}>Esemény megnyitása</Button></div> : <div className="rounded-xl border border-dashed p-4"><p className="font-medium">Még nincs következő alkalom</p><p className="text-sm text-muted-foreground">A CTA az eseményszervező felülethez visz; a Circle tagjai ettől még nem kerülnek automatikusan eseményre.</p><Button type="button" className="mt-3" size="sm" onClick={() => navigate(`/events?circle=${encodeURIComponent(circle.id)}&create=1`)}><CalendarPlus className="mr-2 h-4 w-4" />Szervezzünk újra valamit</Button></div>}
        <section className="space-y-3"><h3 className="font-medium">Aktív tagok</h3><div className="grid gap-2 sm:grid-cols-2">{detail.members.map((member) => <div key={member.user_id} className="flex items-center gap-3 rounded-xl border p-3"><Avatar><AvatarImage src={member.avatar_url || undefined} /><AvatarFallback>{(member.display_name || 'T').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{member.display_name || 'Circle-tag'}</p><p className="text-xs text-muted-foreground">{member.role}{member.city ? ` · ${member.city}` : ''}</p></div></div>)}</div></section>
        {detail.host_id === userId && detail.pending_requests.length > 0 && <section className="space-y-3"><h3 className="font-medium">Jóváhagyásra vár</h3>{detail.pending_requests.map((request) => <div key={request.user_id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="flex flex-1 items-center gap-3"><Avatar><AvatarImage src={request.avatar_url || undefined} /><AvatarFallback>{(request.display_name || 'J').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><p className="font-medium">{request.display_name || 'Jelentkező'}</p><p className="text-xs text-muted-foreground">Szabályok: {request.rules_acknowledged ? 'elfogadva' : 'nincs elfogadva'}</p></div></div><div className="flex gap-2"><Button type="button" size="sm" disabled={workingId === request.user_id || !request.rules_acknowledged} onClick={() => void resolveRequest(request.user_id, true)}><Check className="mr-1 h-4 w-4" />Elfogadás</Button><Button type="button" size="sm" variant="ghost" disabled={workingId === request.user_id} onClick={() => void resolveRequest(request.user_id, false)}><X className="mr-1 h-4 w-4" />Elutasítás</Button></div></div>)}</section>}
      </div> : <p className="py-8 text-center text-sm text-muted-foreground">A részletek nem érhetők el.</p>}
      <DialogFooter>{membershipStatus === 'active' && circle.host_id !== userId && <Button type="button" variant="destructive" disabled={workingId === 'leave'} onClick={() => void leave()}>Circle elhagyása</Button>}<Button type="button" variant="outline" onClick={() => setOpen(false)}>Bezárás</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function HubRuntimeActions({
  hub,
  userId,
  onChanged,
}: RuntimeActionProps & { hub: HubCard }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<HubWelcome | null>(null);
  const [pending, setPending] = useState<HubPendingRequest[]>([]);
  const [insights, setInsights] = useState<HubHostInsights | null>(null);
  const [moderation, setModeration] = useState<HubModerationItem[]>([]);
  const [hostRuntimeUnavailable, setHostRuntimeUnavailable] = useState(false);

  const openDetail = async () => {
    setOpen(true);
    setLoading(true);
    void recordVirtualHubPreview(hub.id, userId);
    setHostRuntimeUnavailable(false);
    const isHost = hub.host_id === userId;
    const [welcomeResult, pendingResult, insightsResult, moderationResult] = await Promise.all([
      loadVirtualHubWelcome(hub.id),
      isHost ? loadVirtualHubPendingRequests(hub.id) : Promise.resolve({ ok: true as const, data: [] as HubPendingRequest[] }),
      isHost ? loadVirtualHubHostInsights(hub.id) : Promise.resolve({ ok: true as const, data: null }),
      isHost ? loadVirtualHubModerationQueue(hub.id) : Promise.resolve({ ok: true as const, data: [] as HubModerationItem[] }),
    ]);
    if (!welcomeResult.ok || !welcomeResult.data) toast.error('A Hub welcome útvonala most nem tölthető be.');
    else setWelcome(welcomeResult.data);
    if (pendingResult.ok) setPending(pendingResult.data);
    if (insightsResult.ok && insightsResult.data) setInsights(insightsResult.data);
    else if (isHost) setHostRuntimeUnavailable(true);
    if (moderationResult.ok) setModeration(moderationResult.data);
    else if (isHost) setHostRuntimeUnavailable(true);
    setLoading(false);
  };

  const refreshHostRuntime = async () => {
    const [pendingResult, moderationResult, insightsResult] = await Promise.all([
      loadVirtualHubPendingRequests(hub.id),
      loadVirtualHubModerationQueue(hub.id),
      loadVirtualHubHostInsights(hub.id),
    ]);
    if (pendingResult.ok) setPending(pendingResult.data);
    if (moderationResult.ok) setModeration(moderationResult.data);
    if (insightsResult.ok && insightsResult.data) setInsights(insightsResult.data);
  };

  const resolveRequest = async (request: HubPendingRequest, approve: boolean) => {
    setWorkingId(request.moderation_item_id);
    const result = await resolveVirtualHubJoinRequest(request.moderation_item_id, approve);
    if (!result.ok) toast.error('A Hub tagsági kérés nem zárható le.');
    else {
      toast.success(approve ? 'A Hub-tagságot jóváhagytad.' : 'A Hub-tagsági kérést elutasítottad.');
      await refreshHostRuntime();
      await onChanged();
    }
    setWorkingId(null);
  };

  const resolveModeration = async (item: HubModerationItem, action: 'review' | 'resolve' | 'dismiss') => {
    setWorkingId(item.moderation_item_id);
    const result = await resolveVirtualHubModerationItem(item.moderation_item_id, action);
    if (!result.ok) toast.error('A Hub moderációs tétel most nem frissíthető.');
    else {
      toast.success(action === 'review' ? 'A felülvizsgálat elindult.' : action === 'resolve' ? 'A tételt lezártad.' : 'A tételt elutasítottad.');
      await refreshHostRuntime();
      await onChanged();
    }
    setWorkingId(null);
  };

  const claimHost = async () => {
    setWorkingId('claim-host');
    const result = await claimVirtualHubHost(hub.id, userId);
    if (!result.ok) toast.error('Host szerep csak aktív, valódi tagként és korábbi megtartott eseménnyel vállalható.');
    else {
      toast.success('Te lettél a Hub hostja. A közösség újra toborozhat.');
      await onChanged();
    }
    setWorkingId(null);
  };

  const reactivate = async () => {
    setWorkingId('reactivate');
    const result = await requestVirtualHubReactivation(hub.id, userId);
    if (!result.ok) toast.error('A Hub reaktiválása most nem kérhető.');
    else {
      toast.success(result.data === 'recruiting' ? 'A Hub ismét toboroz.' : 'A reaktiválási kérést elküldtük felülvizsgálatra.');
      await onChanged();
    }
    setWorkingId(null);
  };

  return <>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void openDetail()}>Welcome és részletek<ChevronRight className="ml-1 h-4 w-4" /></Button>{hub.can_claim_host && <Button type="button" size="sm" disabled={workingId === 'claim-host'} onClick={() => void claimHost()}><UserPlus className="mr-2 h-4 w-4" />Host szerep vállalása</Button>}{hub.membership_status === 'active' && ['latent', 'inactive'].includes(hub.lifecycle_state || '') && <Button type="button" size="sm" variant="outline" disabled={workingId === 'reactivate'} onClick={() => void reactivate()}><RotateCcw className="mr-2 h-4 w-4" />Reaktiválás</Button>}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{hub.hobby_category || 'Helyi Hub'} · {hub.city || 'több helyszín'}</DialogTitle><DialogDescription>Privacy-safe welcome útvonal, magyarázható közösségi állapot és host approval queue.</DialogDescription></DialogHeader>
      {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Hub részletek betöltése" /></div> : <div className="space-y-5">
        <div className="space-y-2 rounded-xl bg-muted/40 p-4"><div className="flex items-center justify-between gap-4"><span className="font-medium">Aktiválási jel</span><Badge variant={hub.qualification_score >= 60 ? 'default' : 'secondary'}>{hub.qualification_score}/100</Badge></div><Progress value={hub.qualification_score} aria-label="Hub qualification score" /><ul className="space-y-1 text-xs text-muted-foreground">{(hub.qualification_reasons || []).map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>
        {hub.host_id === userId && insights && <section aria-labelledby={`hub-funnel-${hub.id}`} className="space-y-3 rounded-xl border p-4"><div><h3 id={`hub-funnel-${hub.id}`} className="font-medium">90 napos aktiválási funnel</h3><p className="text-xs text-muted-foreground">A három fő alatti értékek privacy okból rejtve maradnak.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['discovery', 'Felfedezés'], ['preview', 'Előnézet'], ['joined', 'Csatlakozás'], ['first_attendance', 'Első részvétel'], ['repeat_activity', 'Ismételt aktivitás']] as const).map(([stage, label]) => <div key={stage}><p className="text-xl font-semibold">{insights.funnel[stage] ?? '<3'}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div><div className="flex flex-wrap gap-2"><Badge variant="outline">{insights.new_real_members_30d} új valódi tag</Badge><Badge variant={insights.open_moderation_count > 0 ? 'secondary' : 'outline'}>{insights.open_moderation_count} nyitott moderáció</Badge></div></section>}
        {hub.host_id === userId && hostRuntimeUnavailable && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground" role="status">A host insight vagy moderációs queue most nem tölthető be; a tagsági approval továbbra is külön működik.</p>}
        {welcome?.welcome_message && <div className="rounded-xl border p-4"><p className="font-medium">Üdv a közösségben</p><p className="mt-1 text-sm text-muted-foreground">{welcome.welcome_message}</p></div>}
        {welcome?.host && <div className="flex items-center gap-3 rounded-xl border p-4"><Avatar><AvatarImage src={welcome.host.avatar_url || undefined} /><AvatarFallback>{(welcome.host.display_name || 'H').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><p className="font-medium">{welcome.host.display_name || 'Hub host'}</p><p className="text-xs text-muted-foreground">Opcionális host kapcsolat · {welcome.host.city || 'város nincs megosztva'}</p></div></div>}
        {welcome?.next_beginner_event ? <div className="rounded-xl border p-4"><p className="font-medium">Következő kezdőbarát alkalom</p><p className="text-sm text-muted-foreground">{welcome.next_beginner_event.title} · {new Date(welcome.next_beginner_event.start_at).toLocaleString('hu-HU')}</p><Button type="button" className="mt-3" size="sm" onClick={() => navigate(`/events/${welcome.next_beginner_event?.event_id}`)}>Esemény megnyitása</Button></div> : <div className="rounded-xl border border-dashed p-4"><p className="font-medium">A következő alkalom szervezés alatt</p><p className="text-sm text-muted-foreground">A Hub nem nyilvános chatroom; valódi esemény vagy explicit Circle indítja a közösségi aktivitást.</p><Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => navigate('/events')}><CalendarPlus className="mr-2 h-4 w-4" />Programok keresése</Button></div>}
        {hub.host_id === userId && pending.length > 0 && <section className="space-y-3"><h3 className="font-medium">Hub-tagsági kérelmek</h3>{pending.map((request) => <div key={request.moderation_item_id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="flex flex-1 items-center gap-3"><Avatar><AvatarImage src={request.avatar_url || undefined} /><AvatarFallback>{(request.display_name || 'J').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><p className="font-medium">{request.display_name || 'Jelentkező'}</p><p className="text-xs text-muted-foreground">{request.city || 'város nincs megosztva'} · policy {request.policy_acknowledged ? 'elfogadva' : 'nincs elfogadva'}</p></div></div><div className="flex gap-2"><Button type="button" size="sm" disabled={workingId === request.moderation_item_id || !request.policy_acknowledged} onClick={() => void resolveRequest(request, true)}><Check className="mr-1 h-4 w-4" />Elfogadás</Button><Button type="button" size="sm" variant="ghost" disabled={workingId === request.moderation_item_id} onClick={() => void resolveRequest(request, false)}><X className="mr-1 h-4 w-4" />Elutasítás</Button></div></div>)}</section>}
        {hub.host_id === userId && <section className="space-y-3"><h3 className="font-medium">Hub moderáció és reaktiválás</h3>{moderation.length === 0 ? <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Nincs nyitott moderációs vagy reaktiválási tétel.</p> : moderation.map((item) => <div key={item.moderation_item_id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-medium">{item.item_type === 'reactivation_review' ? 'Újraaktiválási kérés' : item.item_type === 'member_report' ? 'Tagi jelzés' : 'Tartalmi jelzés'}</p><p className="text-xs text-muted-foreground">{item.subject_display_name || 'A személyazonosság privacy okból rejtett'}{item.report_category ? ` · ${item.report_category}` : ''} · {item.status}</p></div><div className="flex flex-wrap gap-2">{item.status === 'open' && <Button type="button" size="sm" variant="outline" disabled={workingId === item.moderation_item_id} onClick={() => void resolveModeration(item, 'review')}>Felülvizsgálom</Button>}<Button type="button" size="sm" disabled={workingId === item.moderation_item_id} onClick={() => void resolveModeration(item, 'resolve')}>{item.item_type === 'reactivation_review' ? 'Reaktiválás jóváhagyása' : 'Lezárás'}</Button><Button type="button" size="sm" variant="ghost" disabled={workingId === item.moderation_item_id} onClick={() => void resolveModeration(item, 'dismiss')}>Elutasítás</Button></div></div>)}</section>}
      </div>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Bezárás</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
