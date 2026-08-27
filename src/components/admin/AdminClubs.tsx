import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  adminListClubMembers,
  adminListClubs,
  adminReviewClub,
  adminUpsertClub,
  type AdminClubMember,
  type AdminClubRow,
  type ClubReviewState,
  type ClubType,
} from '@/lib/clubOperations';

/**
 * Sport clubs and teams.
 *
 * Three ways in: the club registers itself (lands as pending), an admin adds
 * one by hand, or the monthly directory harvest loads a public federation
 * listing. Only the first needs a decision — a directory row is a fact about
 * the world, so it goes live unclaimed.
 */

const STATE_LABELS: Record<ClubReviewState, string> = {
  pending: 'Elbírálásra vár',
  approved: 'Jóváhagyva',
  rejected: 'Elutasítva',
};

const SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin vette fel',
  directory: 'Klubkeresőből',
  self_registered: 'Klub regisztrálta',
};

const TYPE_LABELS: Record<ClubType, string> = {
  sport_club: 'Sportklub',
  team: 'Csapat',
  hobby_club: 'Hobbiklub',
  community_club: 'Közösségi klub',
};

const EMPTY_FORM = {
  name: '', topic: '', city: '', clubType: 'sport_club' as ClubType,
  postalCode: '', address: '', websiteUrl: '', facebookUrl: '',
  contactEmail: '', contactPhone: '', trainingInfo: '', membershipInfo: '',
  description: '',
};

export function AdminClubs() {
  const [rows, setRows] = useState<AdminClubRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<ClubReviewState | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [membersOf, setMembersOf] = useState<AdminClubRow | null>(null);
  const [members, setMembers] = useState<AdminClubMember[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await adminListClubs({
        reviewState: filter === 'all' ? null : filter,
        search: search.trim() || null,
        limit: 200,
      });
      setRows(page.items);
      setCounts(page.counts);
    } catch (loadError) {
      const code = loadError instanceof Error ? loadError.message : '';
      setError(code === 'CAPABILITY_REQUIRED'
        ? 'Ehhez a providers.manage jogosultság kell.'
        : 'A klubok listája most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + value, 0),
    [counts],
  );

  const review = async (club: AdminClubRow, decision: ClubReviewState) => {
    setBusyId(club.id);
    try {
      await adminReviewClub({ clubId: club.id, decision });
      toast.success(decision === 'approved' ? `${club.name} jóváhagyva.` : `${club.name} elutasítva.`);
      await load();
    } catch {
      toast.error('A döntést nem sikerült menteni.');
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (club: AdminClubRow) => {
    setEditingId(club.id);
    setForm({
      name: club.name,
      topic: club.topic || '',
      city: club.city || '',
      clubType: club.clubType,
      postalCode: club.postalCode || '',
      address: club.address || '',
      websiteUrl: club.websiteUrl || '',
      facebookUrl: club.facebookUrl || '',
      contactEmail: club.contactEmail || '',
      contactPhone: club.contactPhone || '',
      trainingInfo: club.trainingInfo || '',
      membershipInfo: club.membershipInfo || '',
      description: club.description || '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      toast.error('A klub neve kötelező.');
      return;
    }
    setSaving(true);
    try {
      await adminUpsertClub({
        clubId: editingId,
        name: form.name.trim(),
        topic: form.topic.trim(),
        city: form.city.trim(),
        clubType: form.clubType,
        postalCode: form.postalCode.trim() || null,
        address: form.address.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        facebookUrl: form.facebookUrl.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        trainingInfo: form.trainingInfo.trim() || null,
        membershipInfo: form.membershipInfo.trim() || null,
        description: form.description.trim() || null,
        reviewState: 'approved',
      });
      toast.success(editingId ? 'Klub frissítve.' : 'Klub felvéve.');
      setFormOpen(false);
      await load();
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : '';
      toast.error(code === 'CAPABILITY_REQUIRED'
        ? 'Ehhez a providers.manage jogosultság kell.'
        : 'A mentés nem sikerült.');
    } finally {
      setSaving(false);
    }
  };

  const openMembers = async (club: AdminClubRow) => {
    setMembersOf(club);
    setMembers([]);
    try {
      setMembers(await adminListClubMembers(club.id));
    } catch {
      toast.error('A jelentkezők listája nem tölthető be.');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" /> Klubok és csapatok
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Összesen {total} klub · {counts.pending || 0} vár elbírálásra
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Frissítés
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Új klub
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => setFilter(value)}
              >
                {value === 'all' ? 'Mind' : STATE_LABELS[value]}
                {value !== 'all' && counts[value] ? <span className="ml-1.5 opacity-70">{counts[value]}</span> : null}
              </Button>
            ))}
            <div className="relative ml-auto min-w-[14rem] flex-1 sm:max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Név, város vagy sportág"
                className="h-9 pl-9"
              />
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          {loading ? (
            <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Klubok betöltése…
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Ebben a nézetben nincs klub.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((club) => (
                <li key={club.id}>
                  <article className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-snug">{club.name}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {[club.topic, [club.postalCode, club.city].filter(Boolean).join(' '), TYPE_LABELS[club.clubType]]
                            .filter(Boolean).join(' · ')}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[11px]">{STATE_LABELS[club.reviewState]}</Badge>
                          <Badge variant="outline" className="text-[11px]">{SOURCE_LABELS[club.source] || club.source}</Badge>
                          {club.claimed && <Badge variant="outline" className="text-[11px]">Gazdája van</Badge>}
                          {!club.isActive && <Badge variant="outline" className="text-[11px] text-destructive">Inaktív</Badge>}
                          {club.interestedCount > 0 && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => void openMembers(club)}
                            >
                              {club.interestedCount} jelentkező
                            </button>
                          )}
                          {club.websiteUrl && (
                            <a
                              href={club.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" /> Honlap
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {club.reviewState !== 'approved' && (
                          <Button size="sm" disabled={busyId === club.id} onClick={() => void review(club, 'approved')}>
                            <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Jóváhagyás
                          </Button>
                        )}
                        {club.reviewState !== 'rejected' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === club.id}
                            onClick={() => void review(club, 'rejected')}
                          >
                            <X className="mr-1 h-4 w-4" aria-hidden="true" /> Elutasítás
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEdit(club)}>
                          <Pencil className="mr-1 h-4 w-4" aria-hidden="true" /> Szerkesztés
                        </Button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Klub szerkesztése' : 'Új klub felvétele'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-name">Név *</Label>
              <Input id="club-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-topic">Téma</Label>
              <Input id="club-topic" value={form.topic} placeholder="pl. Karate, Társasjáték, Baba-mama" onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-type">Típus</Label>
              <select
                id="club-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.clubType}
                onChange={(e) => setForm({ ...form, clubType: e.target.value as ClubType })}
              >
                <option value="sport_club">Sportklub</option>
                <option value="team">Csapat</option>
                <option value="hobby_club">Hobbiklub</option>
                <option value="community_club">Közösségi klub</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-postal">Irányítószám</Label>
              <Input id="club-postal" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-city">Város</Label>
              <Input id="club-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-address">Cím</Label>
              <Input id="club-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-website">Honlap</Label>
              <Input id="club-website" value={form.websiteUrl} placeholder="https://…" onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-facebook">Facebook</Label>
              <Input id="club-facebook" value={form.facebookUrl} placeholder="https://facebook.com/…" onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-email">E-mail</Label>
              <Input id="club-email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="club-phone">Telefon</Label>
              <Input id="club-phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-training">Edzésidők</Label>
              <Input id="club-training" value={form.trainingInfo} placeholder="pl. kedd, csütörtök 18:00" onChange={(e) => setForm({ ...form, trainingInfo: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-membership">Tagsági információ</Label>
              <Input id="club-membership" value={form.membershipInfo} placeholder="pl. havi tagdíj, első alkalom ingyenes" onChange={(e) => setForm({ ...form, membershipInfo: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="club-description">Leírás</Label>
              <Textarea id="club-description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Mégsem</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Mentés…' : 'Mentés'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={membersOf !== null} onOpenChange={(open) => { if (!open) setMembersOf(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Jelentkezők – {membersOf?.name}</DialogTitle>
          </DialogHeader>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Még nincs jelentkező.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((member, index) => (
                <li key={`${member.displayName}-${index}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                  <span className="font-medium">{member.displayName}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {member.status === 'member' ? 'Tag' : 'Érdeklődik'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
