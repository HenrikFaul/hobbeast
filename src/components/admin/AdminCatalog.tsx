import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HOBBY_CATALOG } from "@/lib/hobbyCategories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Layers, FolderTree, Activity, Plus, Pencil, Trash2, Upload, Database } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getCatalogStats } from "@/lib/hobbyCategories";

interface DbCategory {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface DbSubcategory {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
}

interface DbActivity {
  id: string;
  subcategory_id: string;
  slug: string;
  name: string;
  emoji: string | null;
  keywords: string[] | null;
  sort_order: number;
  is_active: boolean;
}

type EditMode = 'category' | 'subcategory' | 'activity';


async function saveBySlug(table: 'hobby_categories' | 'hobby_subcategories' | 'hobby_activities', slug: string, payload: Record<string, unknown>) {
  const { data: existing } = await supabase.from(table).select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', existing.id).select().single();
    if (error) throw error;
    return data as any;
  }
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data as any;
}


export function AdminCatalog() {
  const codeStats = getCatalogStats();
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [subcategories, setSubcategories] = useState<DbSubcategory[]>([]);
  const [activities, setActivities] = useState<DbActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('category');
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', emoji: '', slug: '', description: '', parentId: '' });

  const fetchAll = useCallback(async () => {
    const [catRes, subRes, actRes] = await Promise.all([
      supabase.from('hobby_categories').select('*').order('sort_order'),
      supabase.from('hobby_subcategories').select('*').order('sort_order'),
      supabase.from('hobby_activities').select('*').order('sort_order'),
    ]);
    setCategories((catRes.data as DbCategory[]) || []);
    setSubcategories((subRes.data as DbSubcategory[]) || []);
    setActivities((actRes.data as DbActivity[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const seedFromCode = async () => {
    setSeeding(true);
    try {
      let sortCat = 0;
      for (const cat of HOBBY_CATALOG) {
        let catData;
        try {
          catData = await saveBySlug('hobby_categories', cat.id, { slug: cat.id, name: cat.name, emoji: cat.emoji, description: cat.description, sort_order: sortCat++ });
        } catch (catErr) { console.error(catErr); continue; }

        let sortSub = 0;
        for (const sub of cat.subcategories) {
          const profile = sub.profile;
          let subData;
          try {
            subData = await saveBySlug('hobby_subcategories', sub.id, {
              category_id: catData.id,
              slug: sub.id,
              name: sub.name,
              emoji: sub.emoji || null,
              sort_order: sortSub++,
              location_types: profile.locationTypes,
              physical_intensity: profile.physicalIntensity,
              group_size_min: profile.groupSize.min,
              group_size_max: profile.groupSize.max,
              group_size_typical: profile.groupSize.typical,
              has_distance: profile.hasDistance,
              has_duration: profile.hasDuration,
              has_skill_level: profile.hasSkillLevel,
              has_equipment: profile.hasEquipment,
              is_competitive: profile.isCompetitive,
              is_team_based: profile.isTeamBased,
              can_be_online: profile.canBeOnline,
              suggested_duration_min: profile.suggestedDurationMin || 90,
            });
          } catch (subErr) { console.error(subErr); continue; }

          let sortAct = 0;
          for (const act of sub.activities) {
            try {
              await saveBySlug('hobby_activities', act.id, {
                subcategory_id: subData.id,
                slug: act.id,
                name: act.name,
                emoji: act.emoji || null,
                keywords: act.keywords || [],
                sort_order: sortAct++,
                physical_intensity: act.profile?.physicalIntensity || null,
                is_team_based: act.profile?.isTeamBased ?? null,
                can_be_online: act.profile?.canBeOnline ?? null,
                age_restriction: act.profile?.ageRestriction || null,
              });
            } catch (actErr) {
              console.error(actErr);
            }
          }
        }
      }
      toast.success('Katalógus sikeresen szinkronizálva az adatbázisba!');
      fetchAll();
    } catch (err) {
      toast.error('Hiba a szinkronizálásnál');
      console.error(err);
    }
    setSeeding(false);
  };

  const toggleCat = (id: string) => {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSub = (id: string) => {
    setExpandedSubs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const openEdit = (mode: EditMode, item?: any, parentId?: string) => {
    setEditMode(mode);
    setEditItem(item || null);
    setEditForm({
      name: item?.name || '',
      emoji: item?.emoji || '',
      slug: item?.slug || '',
      description: item?.description || '',
      parentId: parentId || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    const slug = editForm.slug || editForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (editMode === 'category') {
      const payload = { slug, name: editForm.name, emoji: editForm.emoji || '📁', description: editForm.description || null, sort_order: categories.length };
      if (editItem) {
        await supabase.from('hobby_categories').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('hobby_categories').insert(payload);
      }
    } else if (editMode === 'subcategory') {
      const payload = { slug, name: editForm.name, emoji: editForm.emoji || null, category_id: editForm.parentId, sort_order: subcategories.length };
      if (editItem) {
        await supabase.from('hobby_subcategories').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('hobby_subcategories').insert(payload);
      }
    } else {
      const payload = { slug, name: editForm.name, emoji: editForm.emoji || null, subcategory_id: editForm.parentId, sort_order: activities.length };
      if (editItem) {
        await supabase.from('hobby_activities').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('hobby_activities').insert(payload);
      }
    }

    toast.success(editItem ? 'Mentve!' : 'Hozzáadva!');
    setEditOpen(false);
    fetchAll();
  };

  const handleDelete = async (mode: EditMode, id: string) => {
    const table = mode === 'category' ? 'hobby_categories' : mode === 'subcategory' ? 'hobby_subcategories' : 'hobby_activities';
    await supabase.from(table).delete().eq('id', id);
    toast.success('Törölve!');
    fetchAll();
  };

  const dbStats = {
    categories: categories.length,
    subcategories: subcategories.length,
    activities: activities.length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Layers className="h-6 w-6 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold font-display">{dbStats.categories || codeStats.categories}</div>
            <p className="text-xs text-muted-foreground">Kategória</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <FolderTree className="h-6 w-6 mx-auto mb-1 text-accent" />
            <div className="text-2xl font-bold font-display">{dbStats.subcategories || codeStats.subcategories}</div>
            <p className="text-xs text-muted-foreground">Alkategória</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-1 text-warning" />
            <div className="text-2xl font-bold font-display">{dbStats.activities || codeStats.activities}</div>
            <p className="text-xs text-muted-foreground">Tevékenység</p>
          </CardContent>
        </Card>
      </div>

      {/* Seed button */}
      {categories.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="pt-6 text-center space-y-3">
            <Database className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Az adatbázis katalógus üres. Szinkronizáld a kód-alapú katalógust az adatbázisba.</p>
            <Button onClick={seedFromCode} disabled={seeding} className="gradient-primary text-primary-foreground border-0">
              <Upload className="h-4 w-4 mr-2" />
              {seeding ? 'Szinkronizálás...' : 'Katalógus betöltése az adatbázisba'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DB Category tree with CRUD */}
      {categories.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-lg">Adatbázis katalógus</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={seedFromCode} disabled={seeding}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Újraszinkronizálás
              </Button>
              <Button size="sm" onClick={() => openEdit('category')}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Kategória
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map((cat) => {
              const subs = subcategories.filter(s => s.category_id === cat.id);
              return (
                <Collapsible key={cat.id} open={expandedCats.has(cat.id)} onOpenChange={() => toggleCat(cat.id)}>
                  <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="flex-1 justify-start text-left h-auto py-2">
                        {expandedCats.has(cat.id) ? <ChevronDown className="h-4 w-4 mr-2 shrink-0" /> : <ChevronRight className="h-4 w-4 mr-2 shrink-0" />}
                        <span className="mr-2">{cat.emoji}</span>
                        <span className="font-semibold">{cat.name}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">{subs.length} alk.</Badge>
                      </Button>
                    </CollapsibleTrigger>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit('category', cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete('category', cat.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <CollapsibleContent className="pl-8 space-y-1">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => openEdit('subcategory', undefined, cat.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Alkategória hozzáadása
                    </Button>
                    {subs.map((sub) => {
                      const acts = activities.filter(a => a.subcategory_id === sub.id);
                      return (
                        <Collapsible key={sub.id} open={expandedSubs.has(sub.id)} onOpenChange={() => toggleSub(sub.id)}>
                          <div className="flex items-center gap-1">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="flex-1 justify-start text-left h-auto py-1.5">
                                {expandedSubs.has(sub.id) ? <ChevronDown className="h-3.5 w-3.5 mr-2 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mr-2 shrink-0" />}
                                <span className="mr-1.5">{sub.emoji || '📂'}</span>
                                <span className="text-sm">{sub.name}</span>
                                <Badge variant="outline" className="ml-auto text-xs">{acts.length}</Badge>
                              </Button>
                            </CollapsibleTrigger>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit('subcategory', sub, cat.id)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete('subcategory', sub.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <CollapsibleContent className="pl-8">
                            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground mb-1" onClick={() => openEdit('activity', undefined, sub.id)}>
                              <Plus className="h-3 w-3 mr-1" /> Tevékenység
                            </Button>
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {acts.map((act) => (
                                <div key={act.id} className="group inline-flex items-center gap-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {act.emoji || sub.emoji || '📌'} {act.name}
                                  </Badge>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => openEdit('activity', act, sub.id)}>
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDelete('activity', act.id)}>
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editItem ? 'Szerkesztés' : 'Hozzáadás'}: {editMode === 'category' ? 'Kategória' : editMode === 'subcategory' ? 'Alkategória' : 'Tevékenység'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Név</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Emoji</Label>
              <Input value={editForm.emoji} onChange={(e) => setEditForm(f => ({ ...f, emoji: e.target.value }))} placeholder="📁" />
            </div>
            <div>
              <Label>Slug (opcionális)</Label>
              <Input value={editForm.slug} onChange={(e) => setEditForm(f => ({ ...f, slug: e.target.value }))} placeholder="auto-generated" />
            </div>
            {editMode === 'category' && (
              <div>
                <Label>Leírás</Label>
                <Input value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Mégse</Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground border-0">
              {editItem ? 'Mentés' : 'Hozzáadás'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
