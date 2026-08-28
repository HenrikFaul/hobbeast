import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BarChart3, Calendar, Check, Globe, Heart, Loader2, MapPin, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import {
  followOrganization,
  getOrganizationAnalytics,
  getOrganizationPublic,
  requestVerification,
  updateOrganization,
  type OrgAnalytics,
  type OrgPublic,
} from '@/features/organizations/organizations';

/**
 * The organization's public brand page (Slice O-C), and — for a member — the
 * management surface folded in behind it (O-B profile editor, O-F analytics,
 * O-E verification request). One route, `/szervezet/:slug`: everyone sees the
 * brand and its events; a member also gets the tools to run it.
 */

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3 text-center">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ManagePanel({ org, onChanged }: { org: OrgPublic; onChanged: () => void }) {
  const [tagline, setTagline] = useState(org.tagline ?? '');
  const [description, setDescription] = useState(org.description ?? '');
  const [website, setWebsite] = useState(org.website_url ?? '');
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '');
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [verifOpen, setVerifOpen] = useState(false);
  const [verifSocial, setVerifSocial] = useState('');

  useEffect(() => { void getOrganizationAnalytics(org.id).then(setAnalytics); }, [org.id]);

  const save = async () => {
    setSaving(true);
    const result = await updateOrganization(org.id, {
      p_tagline: tagline, p_description: description,
      p_website_url: website.trim() || null, p_logo_url: logoUrl.trim() || null,
    });
    setSaving(false);
    if (result.ok === false) { toast.error(result.message); return; }
    toast.success('Szervezet frissítve.');
    onChanged();
  };

  const askVerification = async () => {
    const result = await requestVerification(org.id, website, verifSocial, 'Verifikáció kérése a brand-oldalról');
    if (result.ok === false) { toast.error(result.message); return; }
    setVerifOpen(false);
    toast.success('Verifikációs kérelem elküldve — hamarosan elbíráljuk.');
    onChanged();
  };

  return (
    <Card className="mt-6 border-primary/20">
      <CardContent className="space-y-5 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">
          <Settings2 className="h-5 w-5 text-primary" aria-hidden="true" /> Szervezet kezelése
        </h2>

        {analytics && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile label="Esemény" value={analytics.events_total} />
            <MetricTile label="Közelgő" value={analytics.upcoming} />
            <MetricTile label="Résztvevő" value={analytics.participants_total} />
            <MetricTile label="Követő" value={analytics.follower_count} />
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="org-tagline">Egy mondatban</Label>
            <Input id="org-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A nyár legjobb bulijai" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="org-desc">Bemutatkozás</Label>
            <Textarea id="org-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="org-web">Weboldal</Label>
              <Input id="org-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="org-logo">Logó URL</Label>
              <Input id="org-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className="mt-1" />
            </div>
          </div>
          <Button disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Mentés
          </Button>
        </div>

        {org.verification_status !== 'verified' && (
          <div className="rounded-xl border border-border/60 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              {org.verification_status === 'pending' ? 'Verifikáció elbírálás alatt' : 'Hitelesített szervező jelvény'}
            </p>
            {org.verification_status !== 'pending' && (
              verifOpen ? (
                <div className="mt-2 space-y-2">
                  <Input value={verifSocial} onChange={(e) => setVerifSocial(e.target.value)} placeholder="Közösségi profil linkje (bizonyíték)" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void askVerification()}>Kérelem küldése</Button>
                    <Button size="sm" variant="ghost" onClick={() => setVerifOpen(false)}>Mégse</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setVerifOpen(true)}>
                  Verifikáció kérése
                </Button>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState<OrgPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const data = await getOrganizationPublic(slug);
    setOrg(data);
    setFollowing(Boolean(data?.is_following));
    setLoading(false);
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const toggleFollow = async () => {
    if (!org) return;
    if (!user) { navigate(`/auth?redirect=/szervezet/${org.slug}`); return; }
    const next = !following;
    setFollowing(next); // optimistic
    const result = await followOrganization(org.id, next);
    if (!result) { setFollowing(!next); toast.error('A művelet nem sikerült.'); return; }
    setOrg({ ...org, follower_count: result.follower_count });
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!org) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Ez a szervezet nem található</h1>
        <Button className="mt-4 rounded-full" onClick={() => navigate('/events')}>Vissza az eseményekhez</Button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <div className="relative mt-4 h-40 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-secondary/40 to-primary/5">
        {org.cover_url && <img src={org.cover_url} alt="" className="h-full w-full object-cover" />}
      </div>

      <div className="-mt-10 px-2">
        <div className="flex items-end gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-background bg-card shadow-sm">
            {org.logo_url
              ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
              : <span className="text-3xl">{org.categories[0] ? '🏛️' : '✨'}</span>}
          </div>
          <div className="flex-1 pb-1">
            <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold leading-tight">
              {org.name}
              {org.verification_status === 'verified' && (
                <ShieldCheck className="h-5 w-5 text-primary" aria-label="Hitelesített szervező" />
              )}
            </h1>
            {org.tagline && <p className="text-sm text-muted-foreground">{org.tagline}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void toggleFollow()} variant={following ? 'outline' : 'default'} className="rounded-full">
            {following ? <><Check className="mr-1 h-4 w-4" /> Követed</> : <><Heart className="mr-1 h-4 w-4" /> Követés</>}
          </Button>
          <span className="text-sm text-muted-foreground">{org.follower_count} követő</span>
          {org.website_url && (
            <a href={org.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
              <Globe className="h-4 w-4" /> Weboldal
            </a>
          )}
          {org.city && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {org.city}</span>}
          {org.is_member && (
            <Button variant="ghost" size="sm" onClick={() => setShowManage((s) => !s)}>
              <Settings2 className="mr-1 h-4 w-4" /> {showManage ? 'Bezár' : 'Kezelés'}
            </Button>
          )}
        </div>

        {org.description && <p className="mt-4 whitespace-pre-line text-sm text-foreground/90">{org.description}</p>}

        {org.is_member && showManage && <ManagePanel org={org} onChanged={load} />}

        <h2 className="mb-3 mt-8 flex items-center gap-2 font-display text-lg font-bold">
          <Calendar className="h-5 w-5 text-primary" aria-hidden="true" /> Közelgő események
        </h2>
        {org.events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            Most nincs meghirdetett esemény. Kövesd a szervezetet, és szólunk, ha új program indul.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {org.events.map((event) => (
              <li key={event.id}>
                <Link to={`/events/${event.id}`} className="block rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden="true">{event.emoji || '📅'}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold leading-snug">{event.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {event.event_date}{event.event_time ? `, ${event.event_time.slice(0, 5)}` : ''}
                        {event.city ? ` · ${event.city}` : ''}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
