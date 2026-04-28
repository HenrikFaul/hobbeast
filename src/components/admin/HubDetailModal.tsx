import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface MemberProfile {
  user_id: string;
  display_name: string | null;
  city: string | null;
  hobbies: string[] | null;
  avatar_url: string | null;
}

interface Props {
  hub: HubBasic | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onViewMember?: (userId: string) => void;
}

export function HubDetailModal({ hub, open, onClose, onUpdated, onViewMember }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [editCity, setEditCity] = useState('');
  const [editHobby, setEditHobby] = useState('');

  useEffect(() => {
    if (!open || !hub) return;
    void loadDetail();
  }, [open, hub?.id]);

  const loadDetail = async () => {
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
    } catch (err: any) {
      toast.error(`Hub adatok betöltése sikertelen: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

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
        },
      });
      if (error) throw error;
      toast.success(`Hub frissítve. Új taglétszám: ${data?.member_count ?? 0}`);
      onUpdated();
      await loadDetail();
    } catch (err: any) {
      toast.error(`Hub mentés hiba: ${err?.message || err}`);
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
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Lokáció</p><p className="font-medium">{detail?.city || 'Országos'}</p></div>
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Tagok</p><p className="font-medium">{detail?.member_count ?? 0} fő</p></div>
              <div><p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Létrehozva</p><p className="font-medium">{detail?.created_at ? new Date(detail.created_at).toLocaleDateString('hu-HU') : '—'}</p></div>
              <div><p className="text-muted-foreground text-xs">Frissítve</p><p className="font-medium">{detail?.updated_at ? new Date(detail.updated_at).toLocaleDateString('hu-HU') : '—'}</p></div>
            </div>

            <div className="rounded-xl border p-3 space-y-3">
              <p className="text-sm font-semibold">Szerkesztés</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Érdeklődési kör (hobbi)</Label>
                  <Input value={editHobby} onChange={(e) => setEditHobby(e.target.value)} className="h-9 rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lokáció (üres = országos)</Label>
                  <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} className="h-9 rounded-lg" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Mentés után a tagok automatikusan újraszámolódnak a profilok hobbi és város adatai alapján.</p>
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
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? 'Mentés...' : 'Mentés és újraszámolás'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
