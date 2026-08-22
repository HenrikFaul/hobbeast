import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Network, MapPin, Users, Calendar, Save, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface HubBasic {
  id: string;
  hobby_category: string;
  city: string | null;
  member_count: number;
  created_at: string;
}

interface HubDetail extends HubBasic {
  updated_at?: string;
  real_member_count?: number;
  simulated_member_count?: number;
  unknown_origin_member_count?: number;
  purpose?: string | null;
  welcome_message?: string | null;
  community_rules?: string | null;
  join_policy?: 'automatic' | 'open' | 'approval' | 'invite_only';
  lifecycle_state?: 'latent' | 'recruiting' | 'active' | 'inactive' | 'archived';
  is_discoverable?: boolean;
}

interface MemberProfile {
  user_id: string;
  display_name: string | null;
  city: string | null;
  hobbies: string[] | null;
  avatar_url: string | null;
  user_origin: 'real' | 'generated' | null;
}

interface Props {
  hub: HubBasic | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onViewMember?: (userId: string) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function HubDetailModal({ hub, open, onClose, onUpdated, onViewMember }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [detail, setDetail] = useState<HubDetail | null>(null);
  const [editCity, setEditCity] = useState('');
  const [editHobby, setEditHobby] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editWelcome, setEditWelcome] = useState('');
  const [editRules, setEditRules] = useState('');
  const [editJoinPolicy, setEditJoinPolicy] = useState<NonNullable<HubDetail['join_policy']>>('automatic');
  const [editLifecycle, setEditLifecycle] = useState<NonNullable<HubDetail['lifecycle_state']>>('latent');
  const [editDiscoverable, setEditDiscoverable] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!hub) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('virtual-hubs-admin', {
        body: { action: 'get_hub_detail', hub_id: hub.id },
      });
      if (error) throw error;
      setDetail(data?.hub || null);
      setProfiles((data?.profiles || []) as MemberProfile[]);
      setEditCity(data?.hub?.city || '');
      setEditHobby(data?.hub?.hobby_category || '');
      setEditPurpose(data?.hub?.purpose || '');
      setEditWelcome(data?.hub?.welcome_message || '');
      setEditRules(data?.hub?.community_rules || '');
      setEditJoinPolicy(data?.hub?.join_policy || 'automatic');
      setEditLifecycle(data?.hub?.lifecycle_state || 'latent');
      setEditDiscoverable(Boolean(data?.hub?.is_discoverable));
    } catch (err) {
      toast.error(`Hub adatok betöltése sikertelen: ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [hub]);

  useEffect(() => {
    if (!open || !hub) return;
    void loadDetail();
  }, [hub, loadDetail, open]);

  const handleSave = async () => {
    if (!hub) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('virtual-hubs-admin', {
        body: {
          action: 'update_hub',
          hub_id: hub.id,
          hobby_category: editHobby.trim(),
          city: editCity.trim() || null,
          purpose: editPurpose.trim() || null,
          welcome_message: editWelcome.trim() || null,
          community_rules: editRules.trim() || null,
          join_policy: editJoinPolicy,
          lifecycle_state: editLifecycle,
          is_discoverable: editDiscoverable,
          reason: 'Virtual Hubs 2 admin editor',
        },
      });
      if (error) throw error;
      toast.success(`Hub metaadatok mentve; a meglévő ${data?.member_count ?? 0} tagság nem változott.`);
      onUpdated();
      await loadDetail();
    } catch (err) {
      toast.error(`Hub mentés hiba: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" /> {hub?.hobby_category || 'Hub'}
          </DialogTitle>
          <DialogDescription>Hub részletek, tagok, és érdeklődési kör / lokáció szerkesztése.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Lokáció</p><p className="font-medium">{detail?.city || 'Nincs városadat'}</p></div>
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Tagok</p><p className="font-medium">{detail?.member_count ?? 0} fő</p></div>
              <div><p className="text-muted-foreground text-xs">Valódi / generált</p><p className="font-medium">{detail?.real_member_count ?? 0} / {detail?.simulated_member_count ?? 0}</p></div>
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Létrehozva</p><p className="font-medium">{detail?.created_at ? new Date(detail.created_at).toLocaleDateString('hu-HU') : '—'}</p></div>
              <div><p className="text-muted-foreground text-xs">Frissítve</p><p className="font-medium">{detail?.updated_at ? new Date(detail.updated_at).toLocaleDateString('hu-HU') : '—'}</p></div>
            </div>

            <div className="rounded-xl border p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">Hub működési szerződés</p>
                <div className="flex items-center gap-2">
                  <Label htmlFor="hub-discoverable" className="text-xs">Felfedezhető</Label>
                  <Switch
                    id="hub-discoverable"
                    checked={editDiscoverable}
                    onCheckedChange={setEditDiscoverable}
                    disabled={!['recruiting', 'active'].includes(editLifecycle)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Érdeklődési kör (hobbi)</Label>
                  <Input value={editHobby} onChange={(e) => setEditHobby(e.target.value)} className="h-9 rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lokáció (üres = nincs városadat)</Label>
                  <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} className="h-9 rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Belépési szabály</Label>
                  <Select value={editJoinPolicy} onValueChange={(value) => setEditJoinPolicy(value as NonNullable<HubDetail['join_policy']>)}>
                    <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Érdeklődésből automatikus</SelectItem>
                      <SelectItem value="open">Nyitott csatlakozás</SelectItem>
                      <SelectItem value="approval">Jóváhagyásos</SelectItem>
                      <SelectItem value="invite_only">Csak meghívással</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Életciklus</Label>
                  <Select
                    value={editLifecycle}
                    onValueChange={(value) => {
                      const next = value as NonNullable<HubDetail['lifecycle_state']>;
                      setEditLifecycle(next);
                      if (!['recruiting', 'active'].includes(next)) setEditDiscoverable(false);
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latent">Látens</SelectItem>
                      <SelectItem value="recruiting">Toborzó</SelectItem>
                      <SelectItem value="active">Aktív</SelectItem>
                      <SelectItem value="inactive">Inaktív</SelectItem>
                      <SelectItem value="archived">Archivált</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cél</Label>
                <Textarea value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)} maxLength={500} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Új tag üdvözlő útvonala</Label>
                <Textarea value={editWelcome} onChange={(e) => setEditWelcome(e.target.value)} maxLength={1000} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Közösségi és biztonsági szabályok</Label>
                <Textarea value={editRules} onChange={(e) => setEditRules(e.target.value)} maxLength={4000} />
              </div>
              <p className="text-xs text-muted-foreground">A metaadat-mentés auditált, a tagságot nem írja át. A tagsági egyeztetés külön, idempotens admin művelet.</p>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Tagok ({profiles.length})</p>
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincsenek tagok.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {profiles.map((p) => (
                    <div key={p.user_id} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.display_name || '(névtelen)'}</p>
                        <p className="text-xs text-muted-foreground">{p.city || 'ismeretlen város'}</p>
                      </div>
                      <Badge variant={p.user_origin === 'generated' ? 'secondary' : 'outline'} className="text-[10px]">
                        {p.user_origin === 'generated' ? 'generált' : p.user_origin === 'real' ? 'valódi' : 'ismeretlen'}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{(p.hobbies || []).length} hobbi</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => p.user_id && onViewMember?.(p.user_id)}
                        title="Tag megtekintése"
                        disabled={!p.user_id || !onViewMember}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Bezár</Button>
          <Button onClick={handleSave} disabled={saving || loading || !editHobby.trim()} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? 'Mentés...' : 'Metaadat mentése'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
