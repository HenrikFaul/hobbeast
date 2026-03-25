import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Users, ChevronRight, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HOBBY_CATALOG, searchActivities, getCatalogStats, type HobbyCategory, type HobbySubcategory } from "@/lib/hobbyCategories";

type ViewLevel = 'categories' | 'subcategories' | 'activities';

const Explore = () => {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewLevel>('categories');
  const [selectedCategory, setSelectedCategory] = useState<HobbyCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<HobbySubcategory | null>(null);

  const stats = getCatalogStats();

  // If searching, show flat results
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
    const map: Record<string, string> = { none: 'bg-muted text-muted-foreground', low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', extreme: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    return map[i] || '';
  };

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-3">
            Fedezd fel a <span className="text-gradient">hobbidat</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-2">
            Válassz kategóriát, és találd meg azokat az embereket, akikkel közös a szenvedélyed.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            {stats.categories} kategória · {stats.subcategories} alkategória · {stats.activities} tevékenység
          </p>
          <div className="relative max-w-md mx-auto">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Keress hobbit... pl. futás, festés, sakk"
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
              className="pl-10"
            />
          </div>
        </motion.div>

        {/* Search results */}
        {searchResults ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">{searchResults.length} találat „{search}" keresésre</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {searchResults.map((act, i) => (
                <motion.div key={act.activityId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="p-4 rounded-xl border bg-card hover-lift cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{act.activityEmoji}</span>
                    <div>
                      <h4 className="font-display font-semibold text-sm">{act.activityName}</h4>
                      <p className="text-xs text-muted-foreground">{act.categoryName} › {act.subcategoryName}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="secondary" className={`text-[10px] ${intensityColor(act.profile.physicalIntensity)}`}>
                      {intensityLabel(act.profile.physicalIntensity)}
                    </Badge>
                    {act.profile.canBeOnline && <Badge variant="outline" className="text-[10px]">Online is</Badge>}
                    {act.profile.isCompetitive && <Badge variant="outline" className="text-[10px]">Versenyszerű</Badge>}
                    <Badge variant="outline" className="text-[10px]">
                      <Users size={8} className="mr-0.5" />{act.profile.groupSize.typical} fő
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
            {searchResults.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg mb-2">Nem találtunk ilyen hobbit 😔</p>
                <p className="text-sm">Próbálj más keresőszót!</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Breadcrumb / back */}
            {view !== 'categories' && (
              <div className="flex items-center gap-2 mb-6">
                <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
                  <ArrowLeft size={14} /> Vissza
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedCategory?.emoji} {selectedCategory?.name}
                  {selectedSubcategory && <> <ChevronRight size={12} className="inline mx-1" /> {selectedSubcategory.name}</>}
                </span>
              </div>
            )}

            {/* Categories grid */}
            {view === 'categories' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {HOBBY_CATALOG.map((cat, i) => (
                  <motion.div key={cat.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="group p-5 rounded-xl border bg-card hover-lift cursor-pointer"
                    onClick={() => handleCategoryClick(cat)}>
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-3xl">{cat.emoji}</span>
                      <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                    </div>
                    <h3 className="font-display font-semibold mb-1">{cat.name}</h3>
                    <p className="text-xs text-muted-foreground mb-3">{cat.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.subcategories.slice(0, 3).map((sub) => (
                        <Badge key={sub.id} variant="secondary" className="text-xs font-normal">{sub.name}</Badge>
                      ))}
                      {cat.subcategories.length > 3 && (
                        <Badge variant="outline" className="text-xs font-normal">+{cat.subcategories.length - 3}</Badge>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Subcategories */}
            {view === 'subcategories' && selectedCategory && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedCategory.subcategories.map((sub, i) => (
                  <motion.div key={sub.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="group p-5 rounded-xl border bg-card hover-lift cursor-pointer"
                    onClick={() => handleSubcategoryClick(sub)}>
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{sub.emoji || selectedCategory.emoji}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={`text-[10px] ${intensityColor(sub.profile.physicalIntensity)}`}>
                          {intensityLabel(sub.profile.physicalIntensity)}
                        </Badge>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </div>
                    <h3 className="font-display font-semibold mb-2">{sub.name}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {sub.activities.slice(0, 4).map((act) => (
                        <Badge key={act.id} variant="outline" className="text-xs font-normal">{act.name}</Badge>
                      ))}
                      {sub.activities.length > 4 && (
                        <Badge variant="outline" className="text-xs font-normal">+{sub.activities.length - 4}</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground">
                      <span><Users size={10} className="inline mr-0.5" />{sub.profile.groupSize.min}–{sub.profile.groupSize.max} fő</span>
                      {sub.profile.canBeOnline && <span>🌐 Online is</span>}
                      {sub.profile.hasDistance && <span>📏 Távolság</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Activities */}
            {view === 'activities' && selectedSubcategory && (
              <div>
                {/* Profile summary card */}
                <div className="mb-6 p-4 rounded-xl border bg-muted/30">
                  <h4 className="font-display font-semibold text-sm mb-2">Esemény paraméterek ehhez az alkategóriához:</h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className={intensityColor(selectedSubcategory.profile.physicalIntensity)}>
                      {intensityLabel(selectedSubcategory.profile.physicalIntensity)}
                    </Badge>
                    <Badge variant="outline"><Users size={10} className="mr-1" />{selectedSubcategory.profile.groupSize.min}–{selectedSubcategory.profile.groupSize.max} fő (átlag: {selectedSubcategory.profile.groupSize.typical})</Badge>
                    {selectedSubcategory.profile.hasDuration && <Badge variant="outline">⏱ Időtartam ({selectedSubcategory.profile.suggestedDurationMin || '?'} perc)</Badge>}
                    {selectedSubcategory.profile.hasDistance && <Badge variant="outline">📏 Távolság/hossz</Badge>}
                    {selectedSubcategory.profile.hasSkillLevel && <Badge variant="outline">📊 Szint</Badge>}
                    {selectedSubcategory.profile.hasEquipment && <Badge variant="outline">🎒 Felszerelés</Badge>}
                    {selectedSubcategory.profile.isCompetitive && <Badge variant="outline">🏆 Verseny</Badge>}
                    {selectedSubcategory.profile.isTeamBased && <Badge variant="outline">👥 Csapat</Badge>}
                    {selectedSubcategory.profile.canBeOnline && <Badge variant="outline">🌐 Online</Badge>}
                    {selectedSubcategory.profile.ageRestriction && selectedSubcategory.profile.ageRestriction !== 'all' && (
                      <Badge variant="outline">🔞 {selectedSubcategory.profile.ageRestriction}</Badge>
                    )}
                    {selectedSubcategory.profile.locationTypes.map(lt => (
                      <Badge key={lt} variant="outline">{lt === 'indoor' ? '🏠 Beltéri' : lt === 'outdoor' ? '🌳 Kültéri' : lt === 'online' ? '💻 Online' : lt === 'both' ? '🏠🌳 Mindkettő' : lt}</Badge>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {selectedSubcategory.activities.map((act, i) => {
                    const mergedProfile = { ...selectedSubcategory.profile, ...(act.profile || {}) };
                    return (
                      <motion.div key={act.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className="p-4 rounded-xl border bg-card hover-lift cursor-pointer">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{act.emoji || selectedSubcategory.emoji}</span>
                          <h4 className="font-display font-semibold text-sm">{act.name}</h4>
                        </div>
                        {act.profile && Object.keys(act.profile).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {act.profile.physicalIntensity && (
                              <Badge variant="secondary" className={`text-[10px] ${intensityColor(act.profile.physicalIntensity)}`}>
                                {intensityLabel(act.profile.physicalIntensity)}
                              </Badge>
                            )}
                            {act.profile.ageRestriction && act.profile.ageRestriction !== 'all' && (
                              <Badge variant="outline" className="text-[10px]">🔞 {act.profile.ageRestriction}</Badge>
                            )}
                            {act.profile.isTeamBased && <Badge variant="outline" className="text-[10px]">👥 Csapat</Badge>}
                            {act.profile.groupSize && (
                              <Badge variant="outline" className="text-[10px]">
                                <Users size={8} className="mr-0.5" />{(mergedProfile as any).groupSize?.typical} fő
                              </Badge>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default Explore;
