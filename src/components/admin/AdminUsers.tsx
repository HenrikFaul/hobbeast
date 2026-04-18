import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Eye, Calendar, MapPin, Clock, Network, RefreshCw, Filter, Search, Trash2, Ban, CheckCircle2, Mail, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { AdminMassUsers } from "./AdminMassUsers";
import { HubDetailModal } from "./HubDetailModal";

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  city: string | null;
  district: string | null;
  hobbies: string[] | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  date_of_birth: string | null;
  preferred_radius_km: number | null;
  user_origin?: 'real' | 'generated' | null;
  is_active?: boolean | null;
}

interface EventParticipation {
  id: string;
  joined_at: string;
  event: { id: string; title: string; category: string; event_date: string | null; image_emoji: string | null; };
}

interface VirtualHub {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
  created_at: string;
}

interface UserHubInfo { hub_id: string; hobby_category: string; city: string | null; }

interface BulkFilters {
  userType: 'all' | 'real' | 'generated';
  registeredOlderThanDays: string;
  inactiveDays: string;
  hasOpenOwnedEvents: 'all' | 'yes' | 'no';
  hobby: string;
  hub: string;
}

const EMPTY_FILTERS: BulkFilters = {
  userType: 'all', registeredOlderThanDays: '', inactiveDays: '', hasOpenOwnedEvents: 'all', hobby: '', hub: '',
};

type SortKey = 'name' | 'created' | 'city' | 'last_activity';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function AdminUsers() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null);
  const [participations, setParticipations] = useState<EventParticipation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hubs, setHubs] = useState<VirtualHub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [refreshingHubs, setRefreshingHubs] = useState(false);
  const [userHubMap, setUserHubMap] = useState<Record<string, UserHubInfo[]>>({});
  const [activeHub, setActiveHub] = useState<VirtualHub | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkFilters, setBulkFilters] = useState<BulkFilters>(EMPTY_FILTERS);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [pendingAction, setPendingAction] = useState<'delete' | 'activate' | 'deactivate' | null>(null);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => { void loadProfiles(); void loadHubs(); void loadUserHubMap(); }, []);

  const loadProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Nem sikerült betölteni a profilokat.'); setProfiles([]); }
    else setProfiles((data as ProfileRow[]) || []);
    setLoading(false);
  };

  const loadHubs = async () => {
    setHubsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('virtual-hubs-admin', { body: { action: 'list' } });
      if (error) throw error;
      const list = (data?.hubs || []) as VirtualHub[];
      setHubs([...list].sort((a, b) => b.member_count - a.member_count));
    } catch (err: any) {
      console.error('loadHubs error', err);
      toast.error(`Hubók betöltése sikertelen: ${err?.message || err}`);
      setHubs([]);
    }
    setHubsLoading(false);
  };

  const loadUserHubMap = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('virtual-hubs-admin', { body: { action: 'user_hub_map' } });
      if (error) throw error;
      setUserHubMap((data?.userHubMap || {}) as Record<string, UserHubInfo[]>);
    } catch (err) {
      console.error('loadUserHubMap error', err);
    }
  };

  const refreshHubs = async () => {
    setRefreshingHubs(true);
    try {
      const { data, error } = await supabase.functions.invoke('virtual-hubs-admin', { body: { action: 'refresh' } });
      if (error) throw error;
      toast.success(`Hubók újraszámolva: ${data?.created || 0} hub, ${data?.members || 0} tagsággal.`);
      await Promise.all([loadHubs(), loadUserHubMap()]);
    } catch (err: any) {
      console.error('refreshHubs error', err);
      toast.error(`Hiba a hubók frissítésekor: ${err?.message || err}`);
    }
    setRefreshingHubs(false);
  };

  const openDetail = async (profile: ProfileRow) => {
    setSelectedUser(profile);
    setDetailLoading(true);
    const { data, error } = await supabase.from('event_participants').select('id, joined_at, event:events(id, title, category, event_date, image_emoji)').eq('user_id', profile.user_id).order('joined_at', { ascending: false });
    if (error) { console.error(error); setParticipations([]); }
    else setParticipations((data as unknown as EventParticipation[]) || []);
    setDetailLoading(false);
  };

  const getAge = (dob: string | null) => { if (!dob) return null; const diff = Date.now() - new Date(dob).getTime(); return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)); };
  const getLastActivity = (profile: ProfileRow) => new Date(profile.updated_at).toLocaleDateString('hu-HU');

  // Filter + sort
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = profiles.filter((p) => {
      if (!q) return true;
      const haystack = [p.display_name, p.city, p.user_origin, ...(p.hobbies || [])].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (bulkFilters.hobby.trim()) {
      const h = bulkFilters.hobby.trim().toLowerCase();
      list = list.filter((p) => (p.hobbies || []).some((x) => String(x).toLowerCase().includes(h)));
    }
    if (bulkFilters.hub.trim()) {
      const h = bulkFilters.hub.trim().toLowerCase();
      list = list.filter((p) => (userHubMap[p.user_id] || []).some((x) => x.hobby_category.toLowerCase().includes(h) || (x.city || '').toLowerCase().includes(h)));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'name': av = (a.display_name || '').toLowerCase(); bv = (b.display_name || '').toLowerCase(); break;
        case 'city': av = (a.city || '').toLowerCase(); bv = (b.city || '').toLowerCase(); break;
        case 'last_activity': av = a.updated_at; bv = b.updated_at; break;
        case 'created':
        default: av = a.created_at; bv = b.created_at; break;
      }
      if (av < bv) return -1 * dir; if (av > bv) return 1 * dir; return 0;
    });
    return list;
  }, [profiles, search, bulkFilters.hobby, bulkFilters.hub, userHubMap, sortKey, sortDir]);

  const visibleProfiles = useMemo(() => filteredProfiles.slice(0, pageSize), [filteredProfiles, pageSize]);

  const realCount = useMemo(() => profiles.filter((p) => (p.user_origin || 'real') !== 'generated').length, [profiles]);
  const generatedCount = profiles.length - realCount;

  const allVisibleSelected = visibleProfiles.length > 0 && visibleProfiles.every((profile) => Boolean(profile.user_id) && selectedUserIds.has(profile.user_id));
  const toggleVisible = (checked: boolean) => {
    setSelectedUserIds((prev) => { const next = new Set(prev); visibleProfiles.forEach((profile) => { if (!profile.user_id) return; if (checked) next.add(profile.user_id); else next.delete(profile.user_id); }); return next; });
  };
  const toggleSingle = (userId: string, checked: boolean) => { setSelectedUserIds((prev) => { const next = new Set(prev); if (checked) next.add(userId); else next.delete(userId); return next; }); };

  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };
  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? null : sortDir === 'asc' ? <ArrowUp className="inline h-3 w-3 ml-1" /> : <ArrowDown className="inline h-3 w-3 ml-1" />;

  const applyBulkSelection = async () => {
    // Apply local filters + hobby/hub filters → select matching set
    const matchingIds = filteredProfiles.map((p) => p.user_id).filter(Boolean) as string[];

    // Server-side filters (registered/inactive/openOwned/userType) still go through the edge function
    const needsServerFilter = bulkFilters.userType !== 'all' || bulkFilters.hasOpenOwnedEvents !== 'all' || bulkFilters.registeredOlderThanDays || bulkFilters.inactiveDays;
    if (!needsServerFilter) {
      setSelectedUserIds(new Set(matchingIds));
      toast.success(`${matchingIds.length} profil kijelölve.`);
      return;
    }

    setBulkApplying(true);
    const { data, error } = await supabase.functions.invoke('admin-bulk-user-actions', {
      body: {
        mode: 'preview',
        filters: {
          userType: bulkFilters.userType,
          registeredOlderThanDays: bulkFilters.registeredOlderThanDays ? Number(bulkFilters.registeredOlderThanDays) : null,
          inactiveDays: bulkFilters.inactiveDays ? Number(bulkFilters.inactiveDays) : null,
          hasOpenOwnedEvents: bulkFilters.hasOpenOwnedEvents,
        },
      },
    });
    if (error) { toast.error(`Tömeges kijelölés hiba: ${error.message}`); }
    else {
      const previewUserIds = Array.isArray(data?.selectedUserIds) ? data.selectedUserIds.filter(Boolean) as string[] : [];
      // Intersect with local hobby/hub filtered set
      const intersect = new Set(previewUserIds.filter((id) => matchingIds.includes(id)));
      setSelectedUserIds(intersect);
      toast.success(`${intersect.size} profil kijelölve a szűrők alapján.`);
    }
    setBulkApplying(false);
  };

  const runBulkAction = async (action: 'delete' | 'activate' | 'deactivate') => {
    if (selectedUserIds.size === 0) return;
    setBulkApplying(true);
    const { data, error } = await supabase.functions.invoke('admin-bulk-user-actions', {
      body: { mode: 'apply', action, userIds: Array.from(selectedUserIds), profileIds: profiles.filter((p) => p.user_id && selectedUserIds.has(p.user_id)).map((p) => p.id) },
    });
    if (error) toast.error(`Tömeges művelet hiba: ${error.message}`);
    else {
      const affected = Number(data?.affected || 0); const failures = Number(data?.failures || 0);
      toast.success(`${affected} profil művelete lefutott.${failures ? ` ${failures} hiba történt.` : ''}`);
      setPendingAction(null); setSelectedUserIds(new Set()); await loadProfiles();
    }
    setBulkApplying(false);
  };

  const renderHobbiesCell = (p: ProfileRow) => {
    const list = p.hobbies || []; if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const first = list[0]; const rest = list.slice(1);
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <Badge variant="secondary" className="text-xs">{first}</Badge>
        {rest.length > 0 && (
          <Popover>
            <PopoverTrigger asChild><Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent">+{rest.length}</Badge></PopoverTrigger>
            <PopoverContent className="w-64"><div className="flex flex-wrap gap-1">{rest.map((h) => <Badge key={h} variant="secondary" className="text-xs">{h}</Badge>)}</div></PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  const renderHubsCell = (p: ProfileRow) => {
    const list = userHubMap[p.user_id] || []; if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const first = list[0]; const rest = list.slice(1);
    const labelOf = (h: UserHubInfo) => `${h.hobby_category}${h.city ? ` · ${h.city}` : ''}`;
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-accent" onClick={() => { const hub = hubs.find((x) => x.id === first.hub_id); if (hub) setActiveHub(hub); }}>{labelOf(first)}</Badge>
        {rest.length > 0 && (
          <Popover>
            <PopoverTrigger asChild><Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent">+{rest.length}</Badge></PopoverTrigger>
            <PopoverContent className="w-72"><div className="flex flex-col gap-1.5">{rest.map((h) => { const hub = hubs.find((x) => x.id === h.hub_id); return <Badge key={h.hub_id} variant="secondary" className="text-xs cursor-pointer hover:bg-accent w-fit" onClick={() => hub && setActiveHub(hub)}>{labelOf(h)}</Badge>; })}</div></PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  // Dynamic table height: row height ~52px + header ~48px
  const tableMaxHeight = pageSize * 56 + 56;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Felhasználók száma: {profiles.length} <span className="text-sm font-normal text-muted-foreground">({realCount} regisztrált / {generatedCount} generált)</span>
            </CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés név, város, hobbi alapján" className="w-64 rounded-xl" />
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Megjelenítés:</Label>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-20 h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => setBulkModalOpen(true)}><Filter className="h-4 w-4" /> Tömeges kijelölés</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('delete')}><Trash2 className="h-4 w-4" /> Törlés</Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('activate')}><CheckCircle2 className="h-4 w-4" /> Aktiválás</Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('deactivate')}><Ban className="h-4 w-4" /> Deaktiválás</Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled><Mail className="h-4 w-4" /> Emlékeztető kiküldése</Button>
            <Badge variant="outline">Kijelölve: {selectedUserIds.size}</Badge>
            <span className="text-xs text-muted-foreground ml-auto">Találat: {filteredProfiles.length} • Megjelenítve: {visibleProfiles.length}</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : visibleProfiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nincs megjeleníthető felhasználó.</p>
          ) : (
            <div className="overflow-y-auto overflow-x-auto rounded-lg border" style={{ maxHeight: `${tableMaxHeight}px` }}>
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleVisible(Boolean(v))} /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>Név<SortIcon k="name" /></TableHead>
                    <TableHead>Forrás</TableHead>
                    <TableHead>Státusz</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('city')}>Város<SortIcon k="city" /></TableHead>
                    <TableHead>Hobbik</TableHead>
                    <TableHead>Hub</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('created')}>Regisztráció<SortIcon k="created" /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('last_activity')}>Utolsó aktivitás<SortIcon k="last_activity" /></TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProfiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><Checkbox checked={Boolean(p.user_id) && selectedUserIds.has(p.user_id)} disabled={!p.user_id} onCheckedChange={(v) => p.user_id && toggleSingle(p.user_id, Boolean(v))} /></TableCell>
                      <TableCell className="font-medium">{p.display_name || '—'}</TableCell>
                      <TableCell><Badge variant={p.user_origin === 'generated' ? 'secondary' : 'outline'}>{p.user_origin === 'generated' ? 'Generált' : 'Igazi'}</Badge></TableCell>
                      <TableCell><Badge variant={p.is_active === false ? 'destructive' : 'default'}>{p.is_active === false ? 'Inaktív' : 'Aktív'}</Badge></TableCell>
                      <TableCell>{p.city || '—'}</TableCell>
                      <TableCell>{renderHobbiesCell(p)}</TableCell>
                      <TableCell>{renderHubsCell(p)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('hu-HU')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getLastActivity(p)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => openDetail(p)}><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AdminMassUsers onUsersCreated={async () => { await loadProfiles(); await loadUserHubMap(); }} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2"><Network className="h-5 w-5 text-primary" /> Virtuális közösségek ({hubs.length})</CardTitle>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={refreshHubs} disabled={refreshingHubs}><RefreshCw className={`h-3.5 w-3.5 ${refreshingHubs ? 'animate-spin' : ''}`} /> {refreshingHubs ? 'Frissítés...' : 'Hubók újraszámolása'}</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Kattints egy sorra a hub részleteinek megnyitásához.</p>
        </CardHeader>
        <CardContent>
          {hubsLoading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : hubs.length === 0 ? <p className="text-muted-foreground text-center py-8">Nincsenek virtuális hubók.</p> : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Érdeklődési kör</TableHead><TableHead>Város</TableHead><TableHead>Tagok száma</TableHead><TableHead>Létrehozva</TableHead></TableRow></TableHeader>
                <TableBody>
                  {hubs.map((hub) => (
                    <TableRow key={hub.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setActiveHub(hub)}>
                      <TableCell className="font-medium">{hub.hobby_category}</TableCell>
                      <TableCell>{hub.city || 'Országos'}</TableCell>
                      <TableCell><Badge variant="secondary">{hub.member_count} fő</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(hub.created_at).toLocaleDateString('hu-HU')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <HubDetailModal hub={activeHub} open={!!activeHub} onClose={() => setActiveHub(null)} onUpdated={async () => { await loadHubs(); await loadUserHubMap(); }} />

      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Tömeges kijelölés szűrőkkel</DialogTitle>
            <DialogDescription>Szűrj felhasználótípus, aktivitás, hobbi és hub alapján.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Felhasználó típusa</Label>
                <Select value={bulkFilters.userType} onValueChange={(value: any) => setBulkFilters((prev) => ({ ...prev, userType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Mindegy</SelectItem><SelectItem value="real">Igazi user</SelectItem><SelectItem value="generated">Generált user</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Van-e nyitott eseménye, aminek ő a gazdája</Label>
                <Select value={bulkFilters.hasOpenOwnedEvents} onValueChange={(value: any) => setBulkFilters((prev) => ({ ...prev, hasOpenOwnedEvents: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Mindegy</SelectItem><SelectItem value="yes">Igen</SelectItem><SelectItem value="no">Nem</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Regisztráció óta eltelt napok</Label><Input type="number" min={0} value={bulkFilters.registeredOlderThanDays} onChange={(e) => setBulkFilters((prev) => ({ ...prev, registeredOlderThanDays: e.target.value }))} placeholder="pl. 40" /></div>
              <div className="space-y-2"><Label>Utolsó belépés óta eltelt napok</Label><Input type="number" min={0} value={bulkFilters.inactiveDays} onChange={(e) => setBulkFilters((prev) => ({ ...prev, inactiveDays: e.target.value }))} placeholder="pl. 40" /></div>
              <div className="space-y-2"><Label>Hobbi (részleges egyezés)</Label><Input value={bulkFilters.hobby} onChange={(e) => setBulkFilters((prev) => ({ ...prev, hobby: e.target.value }))} placeholder="pl. Golf" /></div>
              <div className="space-y-2"><Label>Hub (név vagy város)</Label><Input value={bulkFilters.hub} onChange={(e) => setBulkFilters((prev) => ({ ...prev, hub: e.target.value }))} placeholder="pl. Futás vagy Budapest" /></div>
            </div>
            <div className="flex items-center gap-3">
              <Button className="rounded-xl gap-2" disabled={bulkApplying} onClick={applyBulkSelection}><Filter className="h-4 w-4" /> Szűrés</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => { setBulkFilters(EMPTY_FILTERS); setSelectedUserIds(new Set()); }}>Szűrők törlése</Button>
              <Badge variant="secondary">Kijelölt profilok: {selectedUserIds.size}</Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {selectedUser?.display_name || 'Felhasználó'}</DialogTitle><DialogDescription>A kiválasztott profil részletes adatai és esemény részvételei.</DialogDescription></DialogHeader>
          {selectedUser && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Város</p><p className="font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {selectedUser.city || '—'}{selectedUser.district ? `, ${selectedUser.district}` : ''}</p></div>
                <div><p className="text-muted-foreground text-xs">Kor</p><p className="font-medium">{getAge(selectedUser.date_of_birth) ? `${getAge(selectedUser.date_of_birth)} év` : '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Nem</p><p className="font-medium">{selectedUser.gender || '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Forrás</p><p className="font-medium">{selectedUser.user_origin === 'generated' ? 'Generált' : 'Igazi'}</p></div>
                <div><p className="text-muted-foreground text-xs">Státusz</p><p className="font-medium">{selectedUser.is_active === false ? 'Inaktív' : 'Aktív'}</p></div>
                <div><p className="text-muted-foreground text-xs">Regisztráció</p><p className="font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(selectedUser.created_at).toLocaleDateString('hu-HU')}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground text-xs">Bio</p><p className="font-medium">{selectedUser.bio || '—'}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Hobbik ({(selectedUser.hobbies || []).length})</p>
                <div className="flex flex-wrap gap-1.5">{(selectedUser.hobbies || []).length === 0 && <p className="text-sm text-muted-foreground">Nincs megadva</p>}{(selectedUser.hobbies || []).map((h) => <Badge key={h} variant="secondary">{h}</Badge>)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Hubok ({(userHubMap[selectedUser.user_id] || []).length})</p>
                <div className="flex flex-wrap gap-1.5">{(userHubMap[selectedUser.user_id] || []).length === 0 ? <p className="text-sm text-muted-foreground">Nincs hub</p> : (userHubMap[selectedUser.user_id] || []).map((h) => <Badge key={h.hub_id} variant="secondary" className="cursor-pointer" onClick={() => { const hub = hubs.find((x) => x.id === h.hub_id); if (hub) { setSelectedUser(null); setActiveHub(hub); } }}>{h.hobby_category}{h.city ? ` · ${h.city}` : ''}</Badge>)}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Esemény részvételek ({participations.length})</p>
                {detailLoading ? <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div> : participations.length === 0 ? <p className="text-sm text-muted-foreground">Még nem csatlakozott eseményhez.</p> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {participations.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm">
                        <span>{p.event?.image_emoji || '🎉'}</span>
                        <div className="flex-1 min-w-0"><p className="font-medium truncate">{p.event?.title || '—'}</p><p className="text-xs text-muted-foreground">{p.event?.category} · {p.event?.event_date ? new Date(p.event.event_date).toLocaleDateString('hu-HU') : '—'}</p></div>
                        <span className="text-xs text-muted-foreground">{new Date(p.joined_at).toLocaleDateString('hu-HU')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Biztosan végrehajtod a műveletet?</AlertDialogTitle><AlertDialogDescription>A kijelölt profilokra fut le a művelet. Kijelölt profilok száma: {selectedUserIds.size}.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Mégse</AlertDialogCancel><AlertDialogAction onClick={() => pendingAction && runBulkAction(pendingAction)} disabled={bulkApplying}>{pendingAction === 'delete' ? 'Törlés megerősítése' : 'Megerősítés'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
