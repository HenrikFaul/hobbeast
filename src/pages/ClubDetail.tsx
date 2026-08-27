import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarClock, ExternalLink, Facebook, Loader2, Mail, MapPin, Phone, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { getClub, setClubMembership, type ClubDetail as ClubDetailData } from '@/lib/clubOperations';

const TYPE_LABELS: Record<string, string> = {
  sport_club: 'Sportklub',
  team: 'Csapat',
  hobby_club: 'Hobbiklub',
  community_club: 'Közösségi klub',
};

const ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: 'Ehhez be kell jelentkezned.',
  FEATURE_DISABLED: 'Ez a funkció épp szünetel.',
  CLUB_NOT_FOUND: 'Ez a klub időközben lekerült.',
  USER_SUSPENDED: 'A fiókodra vonatkozó korlátozás miatt ez most nem elérhető.',
};

const ClubDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [club, setClub] = useState<ClubDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      setClub(await getClub(slug));
    } catch {
      setClub(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (status: 'interested' | 'member' | 'left') => {
    if (!user) { navigate(`/auth?redirect=/klubok/${slug}`); return; }
    if (!club) return;
    setSaving(true);
    try {
      const next = await setClubMembership({ clubId: club.id, status });
      if (next) setClub(next);
      toast.success(status === 'left' ? 'Visszavontuk a jelzésed.' : 'Jeleztük a klubnak, hogy érdekel!');
    } catch (statusError) {
      const code = statusError instanceof Error ? statusError.message : '';
      toast.error(ERROR_TEXT[code] || 'A művelet nem sikerült. Próbáld újra.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 pb-16 pt-28">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Klub betöltése…
        </p>
      </main>
    );
  }

  if (!club) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-xl rounded-[2rem] border border-border/70 bg-card/90 px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">Ez a klub nem található</h1>
          <p className="mx-auto mb-6 mt-2 max-w-sm text-sm text-muted-foreground">
            Lehet, hogy lekerült, vagy a hivatkozás már nem érvényes.
          </p>
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/klubok')}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Vissza a klubokhoz
          </Button>
        </div>
      </main>
    );
  }

  const joined = club.myStatus === 'interested' || club.myStatus === 'member';

  return (
    <main className="min-h-screen pb-20 pt-28 sm:pt-32">
      <div className="container mx-auto max-w-4xl px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/klubok')} className="mb-5 rounded-full bg-card/60">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Vissza
        </Button>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <header className="mb-6 rounded-[2rem] bg-[#183124] px-5 py-8 text-white sm:px-8 sm:py-10">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-white/20 bg-white/10 text-[#dfff62] hover:bg-white/10">
                {TYPE_LABELS[club.clubType] || 'Klub'}
              </Badge>
              {club.topic && (
                <Badge className="rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/10">{club.topic}</Badge>
              )}
              {club.beginnerFriendly && (
                <Badge className="rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/10">Kezdőknek is</Badge>
              )}
            </div>
            <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-4xl">{club.name}</h1>
            {(club.city || club.address) && (
              <p className="mt-3 flex items-center gap-2 text-white/[0.7]">
                <MapPin className="h-4 w-4 text-[#dfff62]" aria-hidden="true" />
                {[club.postalCode, club.city, club.address].filter(Boolean).join(', ')}
              </p>
            )}
          </header>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {club.trainingInfo && (
              <Card className="rounded-[1.5rem]">
                <CardContent className="flex items-start gap-3 p-5">
                  <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Edzésidők</p>
                    <p className="mt-1 font-medium">{club.trainingInfo}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {club.membershipInfo && (
              <Card className="rounded-[1.5rem]">
                <CardContent className="flex items-start gap-3 p-5">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Csatlakozás</p>
                    <p className="mt-1 font-medium">{club.membershipInfo}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {club.description && (
            <Card className="mb-6 rounded-[1.5rem]">
              <CardContent className="p-6">
                <p className="whitespace-pre-line leading-7">{club.description}</p>
              </CardContent>
            </Card>
          )}

          <Card className="mb-6 rounded-[1.75rem] border-primary/20 bg-primary/[0.04]">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div>
                <h2 className="font-display text-lg font-semibold">Kipróbálnád?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {club.interestedCount > 0
                    ? `${club.interestedCount} hobbeastos tag jelezte, hogy érdekli ez a klub.`
                    : 'Még senki nem jelezte itt az érdeklődését — te lehetsz az első.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {joined ? (
                  <Button variant="outline" className="rounded-full" disabled={saving} onClick={() => void changeStatus('left')}>
                    Mégsem érdekel
                  </Button>
                ) : (
                  <Button
                    className="rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow"
                    disabled={saving || !club.acceptsNewMembers}
                    onClick={() => void changeStatus('interested')}
                  >
                    {club.acceptsNewMembers ? 'Érdekel, keresnek meg' : 'Jelenleg nem vesznek fel újakat'}
                  </Button>
                )}
                {club.websiteUrl && (
                  <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="rounded-full bg-card">
                      <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" /> A klub honlapja
                    </Button>
                  </a>
                )}
                {club.facebookUrl && (
                  <a href={club.facebookUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="rounded-full bg-card">
                      <Facebook className="mr-1 h-4 w-4" aria-hidden="true" /> Facebook
                    </Button>
                  </a>
                )}
              </div>

              {(club.contactEmail || club.contactPhone) && (
                <div className="flex flex-wrap gap-4 text-sm">
                  {club.contactEmail && (
                    <a href={`mailto:${club.contactEmail}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Mail className="h-4 w-4" aria-hidden="true" /> {club.contactEmail}
                    </a>
                  )}
                  {club.contactPhone && (
                    <a href={`tel:${club.contactPhone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Phone className="h-4 w-4" aria-hidden="true" /> {club.contactPhone}
                    </a>
                  )}
                </div>
              )}

              {/* The one thing this page must never be vague about. */}
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                A Hobbeaston jelzett érdeklődés nem tagfelvétel. A felvételről, az edzésekről és
                a tagdíjról a klub dönt — a jelzés csak annyit tesz, hogy tudnak rólad.
              </p>
            </CardContent>
          </Card>

          {!club.claimed && (
            <p className="text-center text-xs text-muted-foreground">
              Ezek az adatok nyilvános klubkeresőből származnak, a klub még nem vette át az oldalt.
              {club.sourceUrl && (
                <>
                  {' '}
                  <a href={club.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Forrás</a>
                </>
              )}
            </p>
          )}
        </motion.div>
      </div>
    </main>
  );
};

export default ClubDetail;
