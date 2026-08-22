import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CircleDot, Link2, Loader2, Network, Plus, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  createCommunityCircle,
  inviteCommunityCircleMember,
  loadCommunitySnapshot,
  requestCircleMembership,
  requestVirtualHubJoin,
  respondToCircleMembership,
  revokeCommunityConnection,
  setReconnectionPreference,
  transitionCommunityCircle,
  type CircleCard,
  type CircleSuggestionCard,
  type CommunityFeatureAvailability,
  type ConnectionCard,
  type HubCard,
  type ReconnectionCard,
} from '@/features/community';
import { CircleRuntimeActions, CircleSuggestionCards, HubRuntimeActions } from '@/features/community/CommunityRuntimePanels';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CommunityResourceSafetyAction } from '@/components/safety/CommunityResourceSafetyAction';

export default function Community() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reconnections, setReconnections] = useState<ReconnectionCard[]>([]);
  const [preferences, setPreferences] = useState<Map<string, string>>(new Map());
  const [connections, setConnections] = useState<ConnectionCard[]>([]);
  const [circles, setCircles] = useState<CircleCard[]>([]);
  const [suggestions, setSuggestions] = useState<CircleSuggestionCard[]>([]);
  const [memberships, setMemberships] = useState<Map<string, string>>(new Map());
  const [hubs, setHubs] = useState<HubCard[]>([]);
  const [hubRulesAccepted, setHubRulesAccepted] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<CommunityFeatureAvailability>({
    connections: false,
    circles: false,
    hub2: false,
    registryAvailable: true,
  });
  const [circleRulesAccepted, setCircleRulesAccepted] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [circleName, setCircleName] = useState('');
  const [circlePurpose, setCirclePurpose] = useState('');
  const [circleCadence, setCircleCadence] = useState('monthly');
  const [circleCapacity, setCircleCapacity] = useState(12);
  const [circlePolicy, setCirclePolicy] = useState('approval');
  const [circleVisibility, setCircleVisibility] = useState('members');
  const [circleRules, setCircleRules] = useState('');
  const [circleCreationKey, setCircleCreationKey] = useState(() => `circle:${crypto.randomUUID()}`);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const snapshot = await loadCommunitySnapshot(user.id);
    setReconnections(snapshot.reconnections);
    setConnections(snapshot.connections);
    setPreferences(snapshot.preferences);
    setCircles(snapshot.circles);
    setSuggestions(snapshot.suggestions);
    setMemberships(snapshot.memberships);
    setHubs(snapshot.hubs);
    setAvailability(snapshot.availability);
    if (snapshot.unavailableSurfaces.length > 0) {
      toast.error('A közösségi tér néhány része átmenetileg nem tölthető be. Próbáld újra.');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth?redirect=/community', { replace: true });
      return;
    }
    void load();
  }, [authLoading, load, navigate, user]);

  const decideReconnect = async (encounterId: string, decision: 'interested' | 'pass') => {
    setWorkingId(encounterId);
    const result = await setReconnectionPreference(encounterId, decision);
    if (!result.ok) toast.error('A választás nem menthető.');
    else {
      setPreferences((current) => new Map(current).set(encounterId, decision));
      toast.success(result.data ? 'Kölcsönös a kapcsolódás — létrejött a kapcsolat.' : 'A privát választásodat elmentettük.');
      if (result.data) await load();
    }
    setWorkingId(null);
  };

  const revokeConnection = async (connectionId: string) => {
    setWorkingId(connectionId);
    const result = await revokeCommunityConnection(connectionId);
    if (!result.ok) toast.error('A kapcsolat most nem zárható le.');
    else {
      toast.success('A kapcsolatot lezártad.');
      await load();
    }
    setWorkingId(null);
  };

  const createCircle = async () => {
    if (circleName.trim().length < 3 || circlePurpose.trim().length < 3) {
      toast.error('Adj nevet és rövid, egyértelmű célt a Circle-nek.');
      return;
    }
    setWorkingId('create-circle');
    const result = await createCommunityCircle({
      name: circleName,
      purpose: circlePurpose,
      cadence: circleCadence,
      capacity: circleCapacity,
      membershipPolicy: circlePolicy,
      visibility: circleVisibility,
      safetyRules: circleRules,
      creationKey: `${user?.id}:${circleCreationKey}`,
    });
    if (!result.ok) toast.error('A Circle nem hozható létre.');
    else {
      toast.success('A Circle piszkozat létrejött. Aktiválás előtt hívd meg a résztvevőket és véglegesítsd a szabályokat.');
      setCreateOpen(false);
      setCircleName('');
      setCirclePurpose('');
      setCircleRules('');
      setCircleCreationKey(`circle:${crypto.randomUUID()}`);
      await load();
    }
    setWorkingId(null);
  };

  const joinCircle = async (circle: CircleCard) => {
    const acknowledged = !circle.safety_rules || circleRulesAccepted.has(circle.id);
    if (!acknowledged) {
      toast.error('A csatlakozáshoz igazold vissza a Circle szabályait.');
      return;
    }
    setWorkingId(circle.id);
    const result = await requestCircleMembership(circle.id, acknowledged);
    if (!result.ok) toast.error('A csatlakozási kérés nem rögzíthető.');
    else {
      toast.success(result.data === 'active' ? 'Csatlakoztál a Circle-höz.' : 'A csatlakozási kérelmet elküldtük a hostnak.');
      await load();
    }
    setWorkingId(null);
  };

  const transitionCircle = async (circle: CircleCard, nextState: string) => {
    setWorkingId(circle.id);
    const result = await transitionCommunityCircle(circle.id, nextState);
    if (!result.ok) toast.error('Ez a Circle állapotváltás nem engedélyezett.');
    else {
      toast.success(`Circle állapot: ${nextState}.`);
      await load();
    }
    setWorkingId(null);
  };

  const respondToCircleInvite = async (circle: CircleCard, accept: boolean) => {
    const acknowledged = !circle.safety_rules || circleRulesAccepted.has(circle.id);
    if (accept && !acknowledged) {
      toast.error('Az elfogadáshoz igazold vissza a Circle szabályait.');
      return;
    }
    setWorkingId(circle.id);
    const result = await respondToCircleMembership(circle.id, accept, acknowledged);
    if (!result.ok) toast.error('A meghívásra adott válasz nem menthető.');
    else {
      toast.success(accept ? 'A Circle-meghívást elfogadtad.' : 'A meghívást elutasítottad.');
      await load();
    }
    setWorkingId(null);
  };

  const joinHub = async (hub: HubCard) => {
    const acknowledged = !hub.community_rules || hubRulesAccepted.has(hub.id);
    if (!acknowledged) {
      toast.error('A csatlakozáshoz igazold vissza a közösségi szabályokat.');
      return;
    }
    setWorkingId(hub.id);
    const result = await requestVirtualHubJoin(user!.id, hub.id, acknowledged);
    if (!result.ok) toast.error('A hub-csatlakozás most nem rögzíthető.');
    else {
      toast.success(result.data === 'active' ? 'Csatlakoztál a hubhoz.' : 'A csatlakozási kérelmet elküldtük.');
      await load();
    }
    setWorkingId(null);
  };

  const reconnectCount = useMemo(() => reconnections.filter((item) => !preferences.has(item.encounter_id)).length, [preferences, reconnections]);
  const hostedCircles = useMemo(() => circles.filter((circle) => circle.host_id === user?.id && circle.lifecycle_state !== 'archived'), [circles, user?.id]);
  const hasCommunitySurface = availability.connections || availability.circles || availability.hub2;
  const defaultSurface = availability.connections ? 'reconnect' : availability.circles ? 'circles' : 'hubs';

  if (loading || authLoading) return <main className="grid min-h-screen place-items-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Közösségi tér betöltése" /></main>;

  return (
    <main className="min-h-screen px-4 pb-16 pt-24">
      <div className="container mx-auto max-w-6xl space-y-6">
        <div><Badge variant="secondary">Safe local community</Badge><h1 className="mt-3 font-display text-3xl font-bold">Kapcsolódások és közösségek</h1><p className="mt-2 max-w-3xl text-muted-foreground">Közös, hitelesített eseményből induló kölcsönös kapcsolódás; ismétlődő aktivitásra szervezett Circle-ök és aktív helyi Hubok.</p></div>
        {!availability.registryAvailable ? (
          <EmptyState icon={ShieldCheck} title="A közösségi rollout állapota nem elérhető" description="A biztonságos alapállapot aktív: új kapcsolat, Circle vagy Hub művelet nem indul, amíg a szerveroldali feature flag registry nem ellenőrizhető." />
        ) : !hasCommunitySurface ? (
          <EmptyState icon={Network} title="A közösségi funkciók kontrollált bevezetés alatt állnak" description="A kapcsolat, Circle és Hub felületek jelenleg ki vannak kapcsolva. A meglévő esemény- és profilfunkciók ettől változatlanul használhatók." />
        ) : <Tabs defaultValue={defaultSurface} className="space-y-5">
          <TabsList className="flex h-auto w-full flex-wrap gap-1">
            {availability.connections && <TabsTrigger className="flex-1" value="reconnect">Reconnect {reconnectCount > 0 && <Badge className="ml-2">{reconnectCount}</Badge>}</TabsTrigger>}
            {availability.connections && <TabsTrigger className="flex-1" value="connections">Kapcsolatok</TabsTrigger>}
            {availability.circles && <TabsTrigger className="flex-1" value="circles">Circle-ök</TabsTrigger>}
            {availability.hub2 && <TabsTrigger className="flex-1" value="hubs">Hubok</TabsTrigger>}
          </TabsList>

          {availability.connections && <TabsContent value="reconnect" className="grid gap-4 md:grid-cols-2">
            {reconnections.length === 0 ? <EmptyState icon={CalendarCheck} title="Nincs új reconnect javaslat" description="Javaslat csak lezárt esemény és hitelesített check-in után jelenik meg." /> : reconnections.map((item) => <Card key={item.encounter_id}><CardHeader><div className="flex items-center gap-3"><Avatar><AvatarImage src={item.avatar_url || undefined} /><AvatarFallback>{(item.display_name || 'T').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><CardTitle className="text-lg">{item.display_name || 'Eseményrésztvevő'}</CardTitle><CardDescription>{item.event_title}{item.city ? ` · ${item.city}` : ''}</CardDescription></div></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{item.interests?.map((interest) => <Badge key={interest} variant="outline">{interest}</Badge>)}</div><p className="text-xs text-muted-foreground">A választásod privát. A másik fél csak akkor lát kapcsolatot, ha mindketten az „Kapcsolódnék” opciót választjátok.</p><div className="flex gap-2"><Button disabled={workingId === item.encounter_id} variant={preferences.get(item.encounter_id) === 'interested' ? 'default' : 'outline'} onClick={() => void decideReconnect(item.encounter_id, 'interested')}><UserRoundCheck className="mr-2 h-4 w-4" />Kapcsolódnék</Button><Button disabled={workingId === item.encounter_id} variant="ghost" onClick={() => void decideReconnect(item.encounter_id, 'pass')}>Most nem</Button></div></CardContent></Card>)}
          </TabsContent>}

          {availability.connections && <TabsContent value="connections" className="grid gap-4 md:grid-cols-2">
            {connections.length === 0 ? <EmptyState icon={Link2} title="Még nincs aktív kapcsolat" description="A kapcsolat kölcsönös reconnect választással jön létre, és bármikor lezárható." /> : connections.map((item) => <Card key={item.connection_id}><CardContent className="space-y-4 pt-6"><div className="flex items-center gap-3"><Avatar><AvatarImage src={item.avatar_url || undefined} /><AvatarFallback>{(item.display_name || 'T').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{item.display_name || 'Kapcsolat'}</h2><p className="text-xs text-muted-foreground">Kapcsolódás: {new Date(item.connected_at).toLocaleDateString('hu-HU')}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(`/members/${item.other_user_id}`)}>Profil</Button><CircleInviteButton otherUserId={item.other_user_id} displayName={item.display_name} circles={hostedCircles} /><Button variant="ghost" disabled={workingId === item.connection_id} onClick={() => void revokeConnection(item.connection_id)}>Kapcsolat lezárása</Button></div></CardContent></Card>)}
          </TabsContent>}

          {availability.circles && <TabsContent value="circles" className="space-y-4">
            <div className="flex justify-end"><Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Circle létrehozása</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Új Circle</DialogTitle><DialogDescription>Kiscsoportos, ismétlődő aktivitás világos céllal, kapacitással és consent szabályokkal.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Név</Label><Input value={circleName} onChange={(event) => setCircleName(event.target.value)} maxLength={80} /></div><div className="space-y-2"><Label>Cél</Label><Textarea value={circlePurpose} onChange={(event) => setCirclePurpose(event.target.value)} maxLength={500} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Ritmus</Label><Select value={circleCadence} onValueChange={setCircleCadence}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Heti</SelectItem><SelectItem value="biweekly">Kétheti</SelectItem><SelectItem value="monthly">Havi</SelectItem><SelectItem value="flexible">Rugalmas</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Kapacitás</Label><Input type="number" min={2} max={50} value={circleCapacity} onChange={(event) => setCircleCapacity(Number(event.target.value))} /></div><div className="space-y-2"><Label>Tagság</Label><Select value={circlePolicy} onValueChange={setCirclePolicy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invite_only">Meghívásos</SelectItem><SelectItem value="approval">Jóváhagyásos</SelectItem><SelectItem value="open">Nyitott</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Láthatóság</Label><Select value={circleVisibility} onValueChange={setCircleVisibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Privát</SelectItem><SelectItem value="members">Tagoknak</SelectItem><SelectItem value="public">Felfedezhető</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Biztonsági szabályok</Label><Textarea value={circleRules} onChange={(event) => setCircleRules(event.target.value)} maxLength={4000} /></div></div><DialogFooter><Button disabled={workingId === 'create-circle'} onClick={() => void createCircle()}>Piszkozat létrehozása</Button></DialogFooter></DialogContent></Dialog></div>
            <CircleSuggestionCards suggestions={suggestions} onChanged={load} />
            <div className="grid gap-4 md:grid-cols-2">{circles.length === 0 ? <EmptyState icon={CircleDot} title="Nincs felfedezhető Circle" description="Hozz létre egy világos célú kiscsoportot, vagy térj vissza később." /> : circles.map((circle) => { const membership = memberships.get(circle.id); const nextState = circle.lifecycle_state === 'draft' ? 'recruiting' : circle.lifecycle_state === 'recruiting' ? 'active' : circle.lifecycle_state === 'active' ? 'paused' : circle.lifecycle_state === 'paused' ? 'active' : null; return <Card key={circle.id}><CardHeader><CardTitle>{circle.name}</CardTitle><CardDescription>{circle.purpose}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{circle.cadence}</Badge><Badge variant="outline">max. {circle.capacity} fő</Badge><Badge>{circle.lifecycle_state}</Badge></div>{circle.safety_rules && <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={circleRulesAccepted.has(circle.id)} onCheckedChange={(checked) => setCircleRulesAccepted((current) => { const next = new Set(current); if (checked) next.add(circle.id); else next.delete(circle.id); return next; })} /><span><strong>Elfogadom a Circle szabályait.</strong><span className="mt-1 block text-muted-foreground">{circle.safety_rules}</span></span></label>}{circle.host_id === user?.id ? <div className="flex flex-wrap items-center gap-2"><Badge>Te vagy a host</Badge>{nextState && <Button size="sm" disabled={workingId === circle.id} onClick={() => void transitionCircle(circle, nextState)}>{nextState === 'recruiting' ? 'Toborzás indítása' : nextState === 'active' ? 'Aktiválás' : nextState === 'paused' ? 'Szüneteltetés' : 'Újraaktiválás'}</Button>}<Button size="sm" variant="ghost" disabled={workingId === circle.id || circle.lifecycle_state === 'archived'} onClick={() => void transitionCircle(circle, 'archived')}>Archiválás</Button></div> : membership === 'invited' ? <div className="flex flex-wrap gap-2"><Button disabled={workingId === circle.id} onClick={() => void respondToCircleInvite(circle, true)}>Meghívás elfogadása</Button><Button variant="ghost" disabled={workingId === circle.id} onClick={() => void respondToCircleInvite(circle, false)}>Elutasítás</Button></div> : membership ? <Badge variant="secondary">Tagság: {membership}</Badge> : <Button disabled={workingId === circle.id || !['recruiting', 'active'].includes(circle.lifecycle_state)} onClick={() => void joinCircle(circle)}>Csatlakozás</Button>}<CircleRuntimeActions circle={circle} membershipStatus={membership} userId={user!.id} onChanged={load} />{circle.host_id !== user?.id && <CommunityResourceSafetyAction resourceType="circle" resourceId={circle.id} hostUserId={circle.host_id} />}</CardContent></Card>; })}</div>
          </TabsContent>}

          {availability.hub2 && <TabsContent value="hubs" className="grid gap-4 md:grid-cols-2">
            {hubs.length === 0 ? <EmptyState icon={Network} title="Nincs aktív helyi Hub" description="Az inaktív vagy még látens közösségek nem rontják a discovery minőségét." /> : hubs.map((hub) => <Card key={hub.id}><CardHeader><CardTitle>{hub.hobby_category || 'Helyi közösség'}</CardTitle><CardDescription>{hub.city || 'Online / több helyszín'} · {hub.member_count ?? 0} valódi tag</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{hub.purpose || 'Közös aktivitás és ismétlődő helyi alkalmak.'}</p><div className="flex flex-wrap gap-2"><Badge>{hub.lifecycle_state || 'latent'}</Badge>{hub.membership_status && <Badge variant="secondary">Tagság: {hub.membership_status}</Badge>}{hub.host_id === user?.id && <Badge variant="outline">Te vagy a host</Badge>}{hub.host_id === user?.id && hub.pending_join_count > 0 && <Badge variant="outline">{hub.pending_join_count} kérelem</Badge>}</div>{hub.welcome_message && <div className="rounded-xl bg-muted/40 p-3 text-sm"><strong>Új tagként:</strong> {hub.welcome_message}</div>}{hub.community_rules && <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={hubRulesAccepted.has(hub.id)} onCheckedChange={(checked) => setHubRulesAccepted((current) => { const next = new Set(current); if (checked) next.add(hub.id); else next.delete(hub.id); return next; })} /><span><strong>Elfogadom a közösségi szabályokat.</strong><span className="mt-1 block text-muted-foreground">{hub.community_rules}</span></span></label>}{!hub.membership_status && <Button disabled={workingId === hub.id || hub.join_policy === 'automatic' || hub.join_policy === 'invite_only'} onClick={() => void joinHub(hub)}>{hub.join_policy === 'approval' ? 'Csatlakozási kérelem' : hub.join_policy === 'open' ? 'Csatlakozás' : 'Érdeklődésből aktiválódik'}</Button>}<HubRuntimeActions hub={hub} userId={user!.id} onChanged={load} /><CommunityResourceSafetyAction resourceType="hub" resourceId={hub.id} /></CardContent></Card>)}
          </TabsContent>}
        </Tabs>}
        <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 text-primary" />Tiltás esetén a profil, reconnect, kapcsolat, meghívás és értesítés is biztonságosan elnémul.</div>
      </div>
    </main>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof UsersRound; title: string; description: string }) {
  return <Card className="md:col-span-2"><CardContent className="flex flex-col items-center py-12 text-center"><Icon className="mb-3 h-8 w-8 text-muted-foreground" /><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></CardContent></Card>;
}

function CircleInviteButton({ otherUserId, displayName, circles }: { otherUserId: string; displayName: string | null; circles: CircleCard[] }) {
  const [open, setOpen] = useState(false);
  const [circleId, setCircleId] = useState(circles[0]?.id || '');
  const [working, setWorking] = useState(false);
  if (circles.length === 0) return null;

  const invite = async () => {
    if (!circleId) return;
    setWorking(true);
    const result = await inviteCommunityCircleMember(circleId, otherUserId);
    if (!result.ok) toast.error('A meghívás nem küldhető el. Csak aktív, kölcsönös kapcsolat hívható meg.');
    else {
      toast.success('A Circle-meghívást elküldtük; a tagság csak szabályelfogadás után aktiválódik.');
      setOpen(false);
    }
    setWorking(false);
  };

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><UsersRound className="mr-2 h-4 w-4" />Circle-meghívás</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{displayName || 'Kapcsolat'} meghívása</DialogTitle><DialogDescription>A meghívott félnek külön el kell fogadnia a közösségi szabályokat.</DialogDescription></DialogHeader><Select value={circleId} onValueChange={setCircleId}><SelectTrigger><SelectValue placeholder="Válassz Circle-t" /></SelectTrigger><SelectContent>{circles.map((circle) => <SelectItem key={circle.id} value={circle.id}>{circle.name}</SelectItem>)}</SelectContent></Select><DialogFooter><Button disabled={working || !circleId} onClick={() => void invite()}>Meghívás küldése</Button></DialogFooter></DialogContent></Dialog>;
}
