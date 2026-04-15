import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Eye, Calendar, MapPin, Clock, Network, RefreshCw, Filter, Search, Trash2, Ban, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AdminMassUsers } from "./AdminMassUsers";
import { AdminAutoEvents } from "./AdminAutoEvents";

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
  event: {
    id: string;
    title: string;
    category: string;
    event_date: string | null;
    image_emoji: string | null;
  };
}

interface VirtualHub {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
  created_at: string;
}

interface BulkFilters {
  userType: 'all' | 'real' | 'generated';
  registeredOlderThanDays: string;
  inactiveDays: string;
  hasOpenOwnedEvents: 'all' | 'yes' | 'no';
}

const EMPTY_FILTERS: BulkFilters = {
  userType: 'all',
  registeredOlderThanDays: '',
  inactiveDays: '',
  hasOpenOwnedEvents: 'all',
};

export function AdminUsers() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null);
  const [participations, setParticipations] = useState<EventParticipation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hubs, setHubs] = useState<VirtualHub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [refreshingHubs, setRefreshingHubs] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkFilters, setBulkFilters] = useState<BulkFilters>(EMPTY_FILTERS);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMatchedCount, setBulkMatchedCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<'delete' | 'activate' | 'deactivate' | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadProfiles();
    void loadHubs();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      toast.error('Nem sikerült betölteni a profilokat.');
      setProfiles([]);
    } else {
      setProfiles((data as ProfileRow[]) || []);
    }
    setLoading(false);
  };

  const loadHubs = async () => {
    setHubsLoading(true);
    const { data, error } = await supabase.from('virtual_hubs').select('*').order('member_count', { ascending: false });
    if (error) {
      console.error('loadHubs error:', error);
      toast.error(`Hubók betöltése sikertelen: ${error.message}`);
      setHubs([]);
    } else {
      setHubs((data as unknown as VirtualHub[]) || []);
    }
    setHubsLoading(false);
  };

  const refreshHubs = async () => {
    setRefreshingHubs(true);
    try {
      const { error } = await supabase.rpc('refresh_virtual_hubs');
      if (error) {
        console.error('refreshHubs error:', error);
        toast.error(`Hiba a hubók frissítésekor: ${error.message}`);
      } else {
        toast.success('Virtuális hubók frissítve!');
        await loadHubs();
      }
    } catch (err) {
      console.error('refreshHubs exception:', err);
      toast.error('Váratlan hiba a hubók frissítésekor.');
    }
    setRefreshingHubs(false);
  };

  const openDetail = async (profile: ProfileRow) => {
    setSelectedUser(profile);
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('event_participants')
      .select('id, joined_at, event:events(id, title, category, event_date, image_emoji)')
      .eq('user_id', profile.user_id)
      .order('joined_at', { ascending: false });
    if (error) {
      console.error(error);
      setParticipations([]);
    } else {
      setParticipations((data as unknown as EventParticipation[]) || []);
    }
    setDetailLoading(false);
  };

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  const getLastActivity = (profile: ProfileRow) => new Date(profile.updated_at).toLocaleDateString('hu-HU');

  const visibleProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const haystack = [p.display_name, p.city, p.user_origin, ...(p.hobbies || [])].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [profiles, search]);

  const allVisibleSelected = visibleProfiles.length > 0 && visibleProfiles.every((profile) => Boolean(profile.user_id) && selectedUserIds.has(profile.user_id));

  const toggleVisible = (checked: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      visibleProfiles.forEach((profile) => {
        if (!profile.user_id) return;
        if (checked) next.add(profile.user_id);
        else next.delete(profile.user_id);
      });
      return next;
    });
  };

  const toggleSingle = (userId: string, checked: boolean) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };


const applyBulkSelection = async () => {
  const noFiltersApplied = bulkFilters.userType === 'all'
    && bulkFilters.hasOpenOwnedEvents === 'all'
    && !bulkFilters.registeredOlderThanDays
    && !bulkFilters.inactiveDays;

  if (noFiltersApplied) {
    const allIds = profiles.map((profile) => profile.user_id).filter(Boolean) as string[];
    setSelectedUserIds(new Set(allIds));
    setBulkMatchedCount(allIds.length);
    toast.success(`${allIds.length} profil kijelölve a szűrők alapján.`);
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

    if (error) {
      toast.error(`Tömeges kijelölés hiba: ${error.message}`);
    } else {
      
const selectedProfileIds = Array.isArray(data?.selectedProfileIds) ? data.selectedProfileIds.filter(Boolean) as string[] : [];
const previewUserIds = Array.isArray(data?.selectedUserIds) ? data.selectedUserIds.filter(Boolean) as string[] : [];
const userIdsFromProfileIds = profiles
  .filter((profile) => selectedProfileIds.includes(profile.id) && profile.user_id)
  .map((profile) => profile.user_id as string);
const ids = new Set<string>([...previewUserIds, ...userIdsFromProfileIds].filter(Boolean));
setSelectedUserIds(ids);
setBulkMatchedCount(Number(data?.selectedCount || ids.size));
toast.success(`${Number(data?.selectedCount || ids.size)} profil kijelölve a szűrők alapján.`);

    }
    setBulkApplying(false);
  };

  const runBulkAction = async (action: 'delete' | 'activate' | 'deactivate') => {
    if (selectedUserIds.size === 0) return;
    setBulkApplying(true);
    const { data, error } = await supabase.functions.invoke('admin-bulk-user-actions', {
      body: {
        mode: 'apply',
        action,
        userIds: Array.from(selectedUserIds),
        profileIds: profiles.filter((p) => p.user_id && selectedUserIds.has(p.user_id)).map((p) => p.id),
      },
    });

    if (error) {
      toast.error(`Tömeges művelet hiba: ${error.message}`);
    } else {
      const affected = Number(data?.affected || 0);
      const failures = Number(data?.failures || 0);
      toast.success(`${affected} profil művelete lefutott.${failures ? ` ${failures} hiba történt.` : ''}`);
      setPendingAction(null);
      setSelectedUserIds(new Set());
      setBulkMatchedCount(0);
      await loadProfiles();
    }
    setBulkApplying(false);
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Regisztrált felhasználók ({profiles.length})
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés név, város, hobbi alapján" className="w-64 rounded-xl" />
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => setBulkModalOpen(true)}>
                <Filter className="h-4 w-4" /> Tömeges kijelölés
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('delete')}>
              <Trash2 className="h-4 w-4" /> Törlés
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('activate')}>
              <CheckCircle2 className="h-4 w-4" /> Aktiválás
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled={selectedUserIds.size === 0} onClick={() => setPendingAction('deactivate')}>
              <Ban className="h-4 w-4" /> Deaktiválás
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled>
              <Mail className="h-4 w-4" /> Emlékeztető kiküldése
            </Button>
            <Badge variant="outline">Kijelölve: {selectedUserIds.size}</Badge>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : visibleProfiles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nincs megjeleníthető felhasználó.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleVisible(Boolean(v))} /></TableHead>
                    <TableHead>Név</TableHead>
                    <TableHead>Forrás</TableHead>
                    <TableHead>Státusz</TableHead>
                    <TableHead>Város</TableHead>
                    <TableHead>Hobbik</TableHead>
                    <TableHead>Regisztráció</TableHead>
                    <TableHead>Utolsó aktivitás</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProfiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><Checkbox checked={Boolean(p.user_id) && selectedUserIds.has(p.user_id)} disabled={!p.user_id} onCheckedChange={(v) => p.user_id && toggleSingle(p.user_id, Boolean(v))} /></TableCell>
                      <TableCell className="font-medium">{p.display_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={p.user_origin === 'generated' ? 'secondary' : 'outline'}>{p.user_origin === 'generated' ? 'Generált' : 'Igazi'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active === false ? 'destructive' : 'default'}>{p.is_active === false ? 'Inaktív' : 'Aktív'}</Badge>
                      </TableCell>
                      <TableCell>{p.city || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(p.hobbies || []).slice(0, 3).map((h) => <Badge key={h} variant="secondary" className="text-xs">{h}</Badge>)}
                          {(p.hobbies || []).length > 3 && <Badge variant="outline" className="text-xs">+{(p.hobbies || []).length - 3}</Badge>}
                        </div>
                      </TableCell>
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

      <AdminMassUsers onUsersCreated={loadProfiles} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" /> Virtuális közösségek ({hubs.length})
            </CardTitle>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={refreshHubs} disabled={refreshingHubs}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingHubs ? 'animate-spin' : ''}`} /> {refreshingHubs ? 'Frissítés...' : 'Hubók újraszámolása'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">A virtuális közösségek automatikusan jönnek létre a felhasználók érdeklődési körei és városuk alapján. Ezek láthatatlanok a felhasználók számára – kizárólag admin célra.</p>
        </CardHeader>
        <CardContent>
          {hubsLoading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : hubs.length === 0 ? <p className="text-muted-foreground text-center py-8">Nincsenek virtuális hubók. Kattints a „Hubók újraszámolása" gombra a generáláshoz.</p> : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Érdeklődési kör</TableHead><TableHead>Város</TableHead><TableHead>Tagok száma</TableHead><TableHead>Létrehozva</TableHead></TableRow></TableHeader>
                <TableBody>
                  {hubs.map((hub) => (
                    <TableRow key={hub.id}>
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

      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Tömeges kijelölés szűrőkkel</DialogTitle>
            <DialogDescription>Szűrj felhasználótípus, aktivitás és eseménygazda státusz alapján, majd jelöld ki a találatokat tömeges művelethez.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Felhasználó típusa</Label>
                <Select value={bulkFilters.userType} onValueChange={(value: any) => setBulkFilters((prev) => ({ ...prev, userType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mindegy</SelectItem>
                    <SelectItem value="real">Igazi user</SelectItem>
                    <SelectItem value="generated">Generált user</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Van-e nyitott eseménye, aminek ő a gazdája</Label>
                <Select value={bulkFilters.hasOpenOwnedEvents} onValueChange={(value: any) => setBulkFilters((prev) => ({ ...prev, hasOpenOwnedEvents: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mindegy</SelectItem>
                    <SelectItem value="yes">Igen</SelectItem>
                    <SelectItem value="no">Nem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Regisztráció óta eltelt napok</Label>
                <Input type="number" min={0} value={bulkFilters.registeredOlderThanDays} onChange={(e) => setBulkFilters((prev) => ({ ...prev, registeredOlderThanDays: e.target.value }))} placeholder="pl. 40" />
              </div>
              <div className="space-y-2">
                <Label>Utolsó belépés óta eltelt napok</Label>
                <Input type="number" min={0} value={bulkFilters.inactiveDays} onChange={(e) => setBulkFilters((prev) => ({ ...prev, inactiveDays: e.target.value }))} placeholder="pl. 40" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button className="rounded-xl gap-2" disabled={bulkApplying} onClick={applyBulkSelection}><Filter className="h-4 w-4" /> Szűrés</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => { setBulkFilters(EMPTY_FILTERS); setSelectedUserIds(new Set()); setBulkMatchedCount(0); }}>Szűrők törlése</Button>
              <Badge variant="secondary">Kijelölt profilok száma: {selectedUserIds.size}</Badge>
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
                <div><p className="text-muted-foreground text-xs">Keresési sugár</p><p className="font-medium">{selectedUser.preferred_radius_km ? `${selectedUser.preferred_radius_km} km` : '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Forrás</p><p className="font-medium">{selectedUser.user_origin === 'generated' ? 'Generált' : 'Igazi'}</p></div>
                <div><p className="text-muted-foreground text-xs">Státusz</p><p className="font-medium">{selectedUser.is_active === false ? 'Inaktív' : 'Aktív'}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground text-xs">Bio</p><p className="font-medium">{selectedUser.bio || '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Regisztráció</p><p className="font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(selectedUser.created_at).toLocaleDateString('hu-HU')}</p></div>
                <div><p className="text-muted-foreground text-xs">Utolsó aktivitás</p><p className="font-medium">{getLastActivity(selectedUser)}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Hobbik ({(selectedUser.hobbies || []).length})</p>
                <div className="flex flex-wrap gap-1.5">{(selectedUser.hobbies || []).length === 0 && <p className="text-sm text-muted-foreground">Nincs megadva</p>}{(selectedUser.hobbies || []).map((h) => <Badge key={h} variant="secondary">{h}</Badge>)}</div>
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
          <AlertDialogHeader>
            <AlertDialogTitle>Biztosan végrehajtod a műveletet?</AlertDialogTitle>
            <AlertDialogDescription>
              A kijelölt profilokra fut le a művelet. Kijelölt profilok száma: {selectedUserIds.size}. Ez a művelet különösen törlés esetén nem visszavonható.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingAction && runBulkAction(pendingAction)} disabled={bulkApplying}>
              {pendingAction === 'delete' ? 'Törlés megerősítése' : 'Megerősítés'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
