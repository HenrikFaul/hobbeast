import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ExternalLink, Loader2, MapPin, Plus, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { listClubFacets, listClubs, type ClubFacets, type ClubListItem } from '@/lib/clubOperations';
import { ClubRegistrationDialog } from '@/components/clubs/ClubRegistrationDialog';

const numberFormat = new Intl.NumberFormat('hu-HU');

const Clubs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [items, setItems] = useState<ClubListItem[]>([]);
  const [facets, setFacets] = useState<ClubFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const sport = searchParams.get('sport');
  const city = searchParams.get('city');

  useEffect(() => {
    listClubFacets().then(setFacets).catch(() => setFacets(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listClubs({ sport, city, search: search.trim() || null, limit: 48 });
      setItems(page.items);
      setNextOffset(page.nextOffset);
    } catch {
      setError('A klubok listája most nem tölthető be. Próbáld újra kicsit később.');
    } finally {
      setLoading(false);
    }
  }, [sport, city, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadMore = async () => {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const page = await listClubs({ sport, city, search: search.trim() || null, limit: 48, offset: nextOffset });
      setItems((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
    } catch {
      setError('A további klubok betöltése nem sikerült.');
    } finally {
      setLoadingMore(false);
    }
  };

  const setParam = (key: string, value: string | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const topSports = useMemo(() => (facets?.sports || []).slice(0, 12), [facets]);
  const topCities = useMemo(() => (facets?.cities || []).slice(0, 10), [facets]);

  return (
    <main className="min-h-screen pb-20 pt-28 sm:pt-32">
      <div className="container mx-auto px-4">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-[2rem] bg-[#183124] px-5 py-9 text-white sm:px-9 sm:py-11"
        >
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#dfff62]">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> Klubok és csapatok
          </span>
          <h1 className="max-w-3xl font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
            Ahol hétről hétre <span className="text-[#ff8f72]">ugyanazok várnak.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-white/[0.66]">
            Karateklub, evezős egyesület, túraszakosztály. Egy program egy este; egy klub egy
            közösség. Keresd meg a hozzád legközelebbit, és jelezd, hogy szeretnél kipróbálni.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {facets && (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/15 px-4 text-sm font-semibold text-white/[0.78]">
                {numberFormat.format(facets.total)} klub · {facets.sports.length} sportág
              </span>
            )}
            <Button
              className="rounded-full border-[#dfff62] bg-[#dfff62] px-6 text-[#183124] shadow-none hover:bg-[#e7ff8b]"
              onClick={() => setShowRegister(true)}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Klubot regisztrálok
            </Button>
          </div>
        </motion.header>

        <section aria-label="Klubszűrők" className="mb-8 rounded-[1.6rem] border border-border/70 bg-card/90 p-4 sm:p-5">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setParam('q', event.target.value.trim() || null); }}
              placeholder="Klub neve, sportág vagy város"
              className="h-12 rounded-full bg-background/80 pl-11"
            />
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Sportág</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {topSports.map((entry) => (
              <Button
                key={entry.sport}
                size="sm"
                variant={sport === entry.sport ? 'default' : 'outline'}
                className={`rounded-full ${sport === entry.sport ? 'gradient-primary border-0 text-primary-foreground' : 'bg-card'}`}
                onClick={() => setParam('sport', sport === entry.sport ? null : entry.sport)}
              >
                {entry.sport}<span className="ml-1.5 text-xs opacity-70">{entry.clubs}</span>
              </Button>
            ))}
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Város</p>
          <div className="flex flex-wrap gap-2">
            {topCities.map((entry) => (
              <Button
                key={entry.city}
                size="sm"
                variant={city === entry.city ? 'default' : 'outline'}
                className={`rounded-full ${city === entry.city ? 'border-0 bg-accent text-accent-foreground' : 'bg-card'}`}
                onClick={() => setParam('city', city === entry.city ? null : entry.city)}
              >
                {entry.city}<span className="ml-1.5 text-xs opacity-70">{entry.clubs}</span>
              </Button>
            ))}
          </div>
        </section>

        {error && <p role="alert" className="mb-6 text-center text-sm text-destructive">{error}</p>}

        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Klubok betöltése…
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-[1.6rem] border border-border/70 bg-card/80 py-16 text-center">
            <p className="font-display text-lg font-semibold">Nincs találat</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Próbálj más sportágat vagy várost — vagy ha a te klubod hiányzik, vedd fel te.
            </p>
            <Button className="mt-5 rounded-full" onClick={() => setShowRegister(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Klubot regisztrálok
            </Button>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((club) => (
                <li key={club.id}>
                  <article className="group h-full rounded-[1.4rem] border border-border/70 bg-card/95 p-4 transition hover:border-primary/30 hover:shadow-lg">
                    <Link to={`/klubok/${club.slug}`} className="block">
                      <h2 className="font-display font-semibold leading-snug group-hover:text-primary">{club.name}</h2>
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                      {club.sport && <span>{club.sport}</span>}
                      {club.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {[club.postalCode, club.city].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {club.beginnerFriendly && (
                        <Badge variant="outline" className="rounded-full text-[11px]">Kezdőknek is</Badge>
                      )}
                      {club.interestedCount > 0 && (
                        <Badge className="rounded-full bg-primary/10 text-[11px] text-primary hover:bg-primary/10">
                          {club.interestedCount} érdeklődő
                        </Badge>
                      )}
                      {club.websiteUrl && (
                        <a
                          href={club.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Honlap
                        </a>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>

            {nextOffset !== null && (
              <div className="mt-8 text-center">
                <Button variant="outline" className="rounded-full" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Betöltés…' : 'További klubok'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {showRegister && (
        <ClubRegistrationDialog
          authenticated={Boolean(user)}
          onClose={() => setShowRegister(false)}
          onSubmitted={() => { setShowRegister(false); void load(); }}
        />
      )}
    </main>
  );
};

export default Clubs;
