import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ExternalLink, Loader2, MapPin, Plus, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { listClubCountries, listClubFacets, listClubs, type ClubFacets, type ClubListItem } from '@/lib/clubOperations';
import { CountryFilterBar } from '@/components/events/CountryFilterBar';
import {
  readStoredSelection, resolveDefaultCountry, selectionToCountries, writeStoredSelection,
  type CountrySelection,
} from '@/features/events/countryFilter';
import { useI18n } from '@/i18n/I18nProvider';
import { ClubRegistrationDialog } from '@/components/clubs/ClubRegistrationDialog';

const numberFormat = new Intl.NumberFormat('hu-HU');

/** The groups the accessible-audiences plan named, as one-tap filters. */
const AUDIENCES = [
  { key: 'families', label: 'Kisgyerekkel' },
  { key: 'seniors', label: 'Nyugdíjasoknak' },
  { key: 'youth', label: 'Fiataloknak' },
];

const CLUB_TYPES = [
  { key: 'community_club', label: 'Közösségi klub' },
  { key: 'sport_club', label: 'Sportklub' },
];

const Clubs = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useI18n();
  // The SAME stored selection the events listing and the map use, so a member
  // picks a country once and it means the same thing across the product.
  const [countrySelection, setCountrySelection] = useState<CountrySelection>(
    () => readStoredSelection(resolveDefaultCountry()),
  );
  const [countryCounts, setCountryCounts] = useState<Record<string, number>>({});
  const queryCountries = useMemo(() => selectionToCountries(countrySelection), [countrySelection]);
  const [items, setItems] = useState<ClubListItem[]>([]);
  const [facets, setFacets] = useState<ClubFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const topic = searchParams.get('topic');
  const city = searchParams.get('city');
  const clubType = searchParams.get('type');
  const audience = searchParams.get('audience');

  useEffect(() => {
    listClubFacets().then(setFacets).catch(() => setFacets(null));
    listClubCountries()
      .then((rows) => setCountryCounts(Object.fromEntries(rows.map((r) => [r.countryCode, r.events]))))
      .catch(() => setCountryCounts({}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listClubs({
        topic, city, clubType: clubType as never, audience,
        countries: queryCountries,
        search: search.trim() || null, limit: 48,
      });
      setItems(page.items);
      setNextOffset(page.nextOffset);
    } catch {
      setError('A klubok listája most nem tölthető be. Próbáld újra kicsit később.');
    } finally {
      setLoading(false);
    }
  }, [topic, city, clubType, audience, search, queryCountries]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadMore = async () => {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const page = await listClubs({
        topic, city, clubType: clubType as never, audience,
        search: search.trim() || null, limit: 48, offset: nextOffset,
      });
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

  const topTopics = useMemo(() => (facets?.topics || []).slice(0, 14), [facets]);
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
            Karateklub, társasjáték-est, baba-mama kör, nyugdíjas klub, túraszakosztály.
            Egy program egy este; egy klub egy közösség. Keresd meg a hozzád legközelebbit,
            és jelezd, hogy szeretnél kipróbálni.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {facets && (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/15 px-4 text-sm font-semibold text-white/[0.78]">
                {numberFormat.format(facets.total)} klub · {facets.topics.length} téma
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

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Kinek szól?</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {AUDIENCES.map((entry) => (
              <Button
                key={entry.key}
                size="sm"
                variant={audience === entry.key ? 'default' : 'outline'}
                className={`rounded-full ${audience === entry.key ? 'border-0 bg-accent text-accent-foreground' : 'bg-card'}`}
                onClick={() => setParam('audience', audience === entry.key ? null : entry.key)}
              >
                {entry.label}
                <span className="ml-1.5 text-xs opacity-70">
                  {facets?.audiences.find((a) => a.audience === entry.key)?.clubs ?? 0}
                </span>
              </Button>
            ))}
            {CLUB_TYPES.map((entry) => (
              <Button
                key={entry.key}
                size="sm"
                variant={clubType === entry.key ? 'default' : 'outline'}
                className={`rounded-full ${clubType === entry.key ? 'border-0 bg-accent text-accent-foreground' : 'bg-card'}`}
                onClick={() => setParam('type', clubType === entry.key ? null : entry.key)}
              >
                {entry.label}
                <span className="ml-1.5 text-xs opacity-70">
                  {facets?.types.find((t) => t.club_type === entry.key)?.clubs ?? 0}
                </span>
              </Button>
            ))}
          </div>

          {/* Country comes FIRST: it decides what the topic and city chips below
              are even counting. Shared selection with the events listing. */}
          <CountryFilterBar
            selection={countrySelection}
            onChange={(next) => { setCountrySelection(next); writeStoredSelection(next); setParam('city', null); }}
            counts={countryCounts}
            label={t('clubs.countryLabel')}
          />

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Téma</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {topTopics.map((entry) => (
              <Button
                key={entry.topic}
                size="sm"
                variant={topic === entry.topic ? 'default' : 'outline'}
                className={`rounded-full ${topic === entry.topic ? 'gradient-primary border-0 text-primary-foreground' : 'bg-card'}`}
                onClick={() => setParam('topic', topic === entry.topic ? null : entry.topic)}
              >
                {entry.topic}<span className="ml-1.5 text-xs opacity-70">{entry.clubs}</span>
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
                      {club.topic && <span>{club.topic}</span>}
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
