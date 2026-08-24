import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, Search, Sparkles, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HOBBY_CATALOG, searchActivities, getCatalogStats, type HobbyCategory, type HobbySubcategory } from "@/lib/hobbyCategories";
import { CATEGORY_VISUALS } from "@/lib/categoryVisuals";
import boardgameFriends from "@/assets/editorial/explore-boardgame.webp";

type ViewLevel = 'categories' | 'subcategories' | 'activities';

const CATEGORY_TONES = [
  'bg-[#dfff62]',
  'bg-[#ffb09b]',
  'bg-[#c9b7ff]',
  'bg-[#f5d46f]',
] as const;

const Explore = () => {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewLevel>('categories');
  const [selectedCategory, setSelectedCategory] = useState<HobbyCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<HobbySubcategory | null>(null);

  const stats = getCatalogStats();
  const searchResults = search.trim() ? searchActivities(search) : null;

  const handleCategoryClick = (cat: HobbyCategory) => {
    setSelectedCategory(cat);
    setSelectedSubcategory(null);
    setView('subcategories');
  };

  const handleSubcategoryClick = (sub: HobbySubcategory) => {
    setSelectedSubcategory(sub);
    setView('activities');
  };

  const handleBack = () => {
    if (view === 'activities') {
      setSelectedSubcategory(null);
      setView('subcategories');
    } else if (view === 'subcategories') {
      setSelectedCategory(null);
      setView('categories');
    }
  };

  const intensityLabel = (i: string) => {
    const map: Record<string, string> = { none: 'Nyugodt', low: 'Enyhe', medium: 'Közepes', high: 'Intenzív', extreme: 'Extrém' };
    return map[i] || i;
  };

  const intensityColor = (i: string) => {
    const map: Record<string, string> = {
      none: 'border-border bg-secondary text-secondary-foreground',
      low: 'border-primary/20 bg-primary/10 text-primary',
      medium: 'border-amber-300 bg-amber-50 text-amber-800',
      high: 'border-orange-300 bg-orange-50 text-orange-800',
      extreme: 'border-red-300 bg-red-50 text-red-800',
    };
    return map[i] || '';
  };

  return (
    <main className="relative min-h-screen overflow-hidden pb-20 pt-28 sm:pt-32">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-primary/[0.07] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-56 h-80 w-80 rounded-full bg-accent/[0.09] blur-3xl" />

      <div className="container relative mx-auto px-4 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mx-auto mb-12 max-w-6xl overflow-hidden rounded-[2rem] bg-[#251b43] px-5 py-8 text-center text-white shadow-[0_28px_80px_-42px_rgba(37,27,67,0.7)] sm:mb-16 sm:rounded-[2.6rem] sm:px-10 sm:py-10 lg:px-12 lg:py-12 lg:text-left"
        >
          <div aria-hidden="true" className="absolute -left-16 -top-20 h-56 w-56 rounded-full border-[38px] border-[#dfff62]/15" />
          <div aria-hidden="true" className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#ff8f72]/15 blur-3xl" />
          <div className="relative grid items-center gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)] lg:gap-12">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#dfff62]">
                <Sparkles aria-hidden="true" size={14} /> Közös érdeklődésből valódi élmény
              </div>
              <h1 className="mb-5 font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-[4.5rem]">
                Fedezd fel a <span className="text-[#ff8f72]">hobbidat</span>
              </h1>
              <p className="mx-auto mb-7 max-w-2xl text-base font-medium leading-relaxed text-white/[0.68] sm:text-lg lg:mx-0">
                Válassz kategóriát, és találd meg azokat az embereket, akikkel közös a szenvedélyed.
              </p>

              <div className="relative mx-auto max-w-2xl lg:mx-0">
                <Search aria-hidden="true" size={20} className="absolute left-5 top-1/2 z-10 -translate-y-1/2 text-primary" />
                <Input
                  aria-label="Hobbi keresése"
                  placeholder="Keress hobbit... pl. futás, festés, sakk"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); }}
                  className="h-14 rounded-2xl border-white/20 bg-[#fffdf7] pl-14 pr-5 text-base text-foreground shadow-xl backdrop-blur-sm sm:h-16 sm:rounded-3xl"
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-white/[0.68] sm:gap-3 lg:justify-start">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5"><strong className="text-white">{stats.categories}</strong> kategória</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5"><strong className="text-white">{stats.subcategories}</strong> alkategória</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5"><strong className="text-white">{stats.activities}</strong> tevékenység</span>
              </div>
            </div>

            <figure className="relative mx-auto aspect-[4/3] w-full max-w-[29rem]">
              <div aria-hidden="true" className="absolute -inset-3 rotate-3 rounded-[3rem_1.4rem_4.2rem_2rem] bg-[#dfff62]" />
              <img
                src={boardgameFriends}
                alt="Baráti társaság nevet egy közös társasjáték mellett"
                width={1280}
                height={853}
                loading="lazy"
                decoding="async"
                className="relative h-full w-full -rotate-1 rounded-[3rem_1.4rem_4.2rem_2rem] object-cover shadow-2xl"
              />
              <figcaption className="absolute -bottom-3 left-3 rotate-[-3deg] rounded-full border-2 border-[#251b43] bg-[#ff8f72] px-4 py-2 text-sm font-extrabold text-[#251b43] shadow-xl sm:left-6">
                nevetés-kompatibilis ✓
              </figcaption>
              <span aria-hidden="true" className="absolute -right-2 top-5 rotate-6 rounded-full border-2 border-[#251b43] bg-[#c9b7ff] px-3 py-2 text-xs font-extrabold text-[#251b43] shadow-xl">
                társas • új arcok
              </span>
            </figure>
          </div>
        </motion.header>

        {searchResults ? (
          <section aria-live="polite">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Keresési eredmények</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{searchResults.length} találat „{search}" keresésre</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="rounded-full">Keresés törlése</Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {searchResults.map((act, i) => (
                <motion.article
                  key={act.activityId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-lg shadow-primary/[0.04]"
                >
                  <div className="mb-5 flex items-start gap-3">
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.08] text-2xl">{act.activityEmoji}</span>
                    <div className="min-w-0 pt-0.5">
                      <h3 className="font-display font-semibold leading-snug">{act.activityName}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{act.categoryName} › {act.subcategoryName}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${intensityColor(act.profile.physicalIntensity)}`}>
                      {intensityLabel(act.profile.physicalIntensity)}
                    </Badge>
                    {act.profile.canBeOnline && <Badge variant="outline" className="text-[10px]">Online is</Badge>}
                    {act.profile.isCompetitive && <Badge variant="outline" className="text-[10px]">Versenyszerű</Badge>}
                    <Badge variant="outline" className="text-[10px]">
                      <Users aria-hidden="true" size={8} className="mr-0.5" />{act.profile.groupSize.typical} fő
                    </Badge>
                  </div>
                </motion.article>
              ))}
            </div>

            {searchResults.length === 0 && (
              <div className="mx-auto max-w-xl rounded-[2rem] border border-border/70 bg-card/90 px-6 py-14 text-center shadow-xl shadow-primary/[0.04]">
                <span aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl">🔎</span>
                <h2 className="font-display text-xl font-semibold">Nem találtunk ilyen hobbit</h2>
                <p className="mt-2 text-sm text-muted-foreground">Próbálj egy rövidebb vagy másik keresőszót!</p>
                <Button variant="outline" size="sm" onClick={() => setSearch('')} className="mt-5 rounded-full">Új keresés</Button>
              </div>
            )}
          </section>
        ) : (
          <>
            {view !== 'categories' && (
              <nav aria-label="Hobbi kategória útvonal" className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 pr-4 shadow-sm backdrop-blur-sm">
                <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1 rounded-full">
                  <ArrowLeft aria-hidden="true" size={14} /> Vissza
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedCategory?.emoji} {selectedCategory?.name}
                  {selectedSubcategory && <> <ChevronRight aria-hidden="true" size={12} className="mx-1 inline" /> {selectedSubcategory.name}</>}
                </span>
              </nav>
            )}

            {view === 'categories' && (
              <section aria-labelledby="category-heading">
                <div className="mb-7 max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Indulj el innen</p>
                  <h2 id="category-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Milyen élményre vágysz?</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {HOBBY_CATALOG.map((cat, i) => (
                    <motion.button
                      type="button"
                      key={cat.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`group relative isolate min-h-[19rem] overflow-hidden rounded-[2rem] border border-foreground/[0.08] p-4 text-left shadow-[0_22px_55px_-38px_rgba(24,49,36,0.5)] transition duration-300 hover:-translate-y-1 hover:rotate-[0.3deg] hover:border-foreground/15 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${CATEGORY_TONES[i % CATEGORY_TONES.length]}`}
                      onClick={() => handleCategoryClick(cat)}
                      aria-label={`${cat.name} kategória megnyitása`}
                    >
                      {CATEGORY_VISUALS[cat.id] && (
                        <div aria-hidden="true" className="absolute inset-0 overflow-hidden" data-testid="category-visual">
                          <img
                            src={CATEGORY_VISUALS[cat.id].src}
                            alt=""
                            width={720}
                            height={480}
                            loading={i < 4 ? "eager" : "lazy"}
                            decoding="async"
                            style={{ objectPosition: CATEGORY_VISUALS[cat.id].position }}
                            className="h-full w-full object-cover opacity-45 saturate-75 mix-blend-multiply transition duration-500 group-hover:scale-105 group-hover:opacity-55 motion-reduce:transform-none"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-white/10 to-white/45" />
                        </div>
                      )}

                      <div className="relative flex h-full min-h-[17rem] flex-col">
                        <div className="flex items-start justify-between">
                          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-white/70 bg-card/85 text-3xl shadow-sm backdrop-blur-md">{cat.emoji}</span>
                          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/65 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <ChevronRight aria-hidden="true" size={17} />
                          </span>
                        </div>

                        <div className="mt-auto rounded-[1.35rem] border border-white/55 bg-card/80 p-4 shadow-sm backdrop-blur-md">
                          <h3 className="font-display text-xl font-semibold leading-tight">{cat.name}</h3>
                          <p className="mb-4 mt-2 text-sm leading-relaxed text-muted-foreground">{cat.description}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {cat.subcategories.slice(0, 3).map((sub) => (
                              <Badge key={sub.id} variant="secondary" className="bg-card/80 text-xs font-normal">{sub.name}</Badge>
                            ))}
                            {cat.subcategories.length > 3 && (
                              <Badge variant="outline" className="bg-card/65 text-xs font-normal">+{cat.subcategories.length - 3}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {view === 'subcategories' && selectedCategory && (
              <section aria-labelledby="subcategory-heading">
                <div className="mb-7 max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{selectedCategory.name}</p>
                  <h2 id="subcategory-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Válassz egy közelebbi irányt</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedCategory.subcategories.map((sub, i) => (
                    <motion.button
                      type="button"
                      key={sub.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group min-h-56 rounded-[2rem] border border-border/70 bg-card/95 p-6 text-left shadow-lg shadow-primary/[0.04] transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      onClick={() => handleSubcategoryClick(sub)}
                      aria-label={`${sub.name} alkategória megnyitása`}
                    >
                      <div className="mb-6 flex items-start justify-between gap-3">
                        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">{sub.emoji || selectedCategory.emoji}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${intensityColor(sub.profile.physicalIntensity)}`}>
                            {intensityLabel(sub.profile.physicalIntensity)}
                          </Badge>
                          <ChevronRight aria-hidden="true" size={16} className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                        </div>
                      </div>
                      <h3 className="font-display text-lg font-semibold">{sub.name}</h3>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {sub.activities.slice(0, 4).map((act) => (
                          <Badge key={act.id} variant="outline" className="bg-background/60 text-xs font-normal">{act.name}</Badge>
                        ))}
                        {sub.activities.length > 4 && (
                          <Badge variant="outline" className="bg-background/60 text-xs font-normal">+{sub.activities.length - 4}</Badge>
                        )}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-3 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
                        <span><Users aria-hidden="true" size={11} className="mr-1 inline" />{sub.profile.groupSize.min}–{sub.profile.groupSize.max} fő</span>
                        {sub.profile.canBeOnline && <span>🌐 Online is</span>}
                        {sub.profile.hasDistance && <span>📏 Távolság</span>}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {view === 'activities' && selectedSubcategory && (
              <section aria-labelledby="activity-heading">
                <div className="mb-7 max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{selectedSubcategory.name}</p>
                  <h2 id="activity-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Találd meg a neked való tevékenységet</h2>
                </div>

                <div className="mb-8 rounded-[2rem] border border-primary/15 bg-primary/[0.06] p-5 sm:p-6">
                  <h3 className="font-display text-sm font-semibold">Esemény paraméterek ehhez az alkategóriához:</h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className={intensityColor(selectedSubcategory.profile.physicalIntensity)}>
                      {intensityLabel(selectedSubcategory.profile.physicalIntensity)}
                    </Badge>
                    <Badge variant="outline" className="bg-card/60"><Users aria-hidden="true" size={10} className="mr-1" />{selectedSubcategory.profile.groupSize.min}–{selectedSubcategory.profile.groupSize.max} fő (átlag: {selectedSubcategory.profile.groupSize.typical})</Badge>
                    {selectedSubcategory.profile.hasDuration && <Badge variant="outline" className="bg-card/60">⏱ Időtartam ({selectedSubcategory.profile.suggestedDurationMin || '?'} perc)</Badge>}
                    {selectedSubcategory.profile.hasDistance && <Badge variant="outline" className="bg-card/60">📏 Távolság/hossz</Badge>}
                    {selectedSubcategory.profile.hasSkillLevel && <Badge variant="outline" className="bg-card/60">📊 Szint</Badge>}
                    {selectedSubcategory.profile.hasEquipment && <Badge variant="outline" className="bg-card/60">🎒 Felszerelés</Badge>}
                    {selectedSubcategory.profile.isCompetitive && <Badge variant="outline" className="bg-card/60">🏆 Verseny</Badge>}
                    {selectedSubcategory.profile.isTeamBased && <Badge variant="outline" className="bg-card/60">👥 Csapat</Badge>}
                    {selectedSubcategory.profile.canBeOnline && <Badge variant="outline" className="bg-card/60">🌐 Online</Badge>}
                    {selectedSubcategory.profile.ageRestriction && selectedSubcategory.profile.ageRestriction !== 'all' && (
                      <Badge variant="outline" className="bg-card/60">🔞 {selectedSubcategory.profile.ageRestriction}</Badge>
                    )}
                    {selectedSubcategory.profile.locationTypes.map(lt => (
                      <Badge key={lt} variant="outline" className="bg-card/60">{lt === 'indoor' ? '🏠 Beltéri' : lt === 'outdoor' ? '🌳 Kültéri' : lt === 'online' ? '💻 Online' : lt === 'both' ? '🏠🌳 Mindkettő' : lt}</Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {selectedSubcategory.activities.map((act, i) => {
                    const mergedProfile = { ...selectedSubcategory.profile, ...(act.profile || {}) };
                    return (
                      <motion.article
                        key={act.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-lg shadow-primary/[0.04]"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl">{act.emoji || selectedSubcategory.emoji}</span>
                          <h3 className="font-display font-semibold leading-snug">{act.name}</h3>
                        </div>
                        {act.profile && Object.keys(act.profile).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-4">
                            {act.profile.physicalIntensity && (
                              <Badge variant="outline" className={`text-[10px] ${intensityColor(act.profile.physicalIntensity)}`}>
                                {intensityLabel(act.profile.physicalIntensity)}
                              </Badge>
                            )}
                            {act.profile.ageRestriction && act.profile.ageRestriction !== 'all' && (
                              <Badge variant="outline" className="text-[10px]">🔞 {act.profile.ageRestriction}</Badge>
                            )}
                            {act.profile.isTeamBased && <Badge variant="outline" className="text-[10px]">👥 Csapat</Badge>}
                            {act.profile.groupSize && (
                              <Badge variant="outline" className="text-[10px]">
                                <Users aria-hidden="true" size={8} className="mr-0.5" />{mergedProfile.groupSize?.typical} fő
                              </Badge>
                            )}
                          </div>
                        )}
                      </motion.article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default Explore;
