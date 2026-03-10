import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const hobbyCategories = [
  { name: "Sport", emoji: "⚽", count: 156, subcategories: ["Futás", "Foci", "Kosárlabda", "Tenisz", "Jóga", "Lovaglás"] },
  { name: "Extrém sport", emoji: "🏄", count: 42, subcategories: ["Airsoft", "Paintball", "Sziklamászás", "Búvárkodás"] },
  { name: "Kreatív & Kézműves", emoji: "🎨", count: 89, subcategories: ["Festés", "Kerámiázás", "Horgolás", "Varrás"] },
  { name: "Zene", emoji: "🎸", count: 73, subcategories: ["Gitár", "Zongora", "Éneklés", "DJ"] },
  { name: "Társasjátékok", emoji: "🎲", count: 64, subcategories: ["Sakk", "Társasozás", "Puzzle", "Póker"] },
  { name: "Gasztronómia", emoji: "👨‍🍳", count: 91, subcategories: ["Főzés", "Sütés", "Borkóstolás", "Kávékultúra"] },
  { name: "Természet & Túra", emoji: "🏔️", count: 112, subcategories: ["Kirándulás", "Kertészet", "Geocaching", "Horgászat"] },
  { name: "Fotózás & Film", emoji: "📸", count: 58, subcategories: ["Fotózás", "Videózás", "Drónozás"] },
  { name: "Technológia", emoji: "💻", count: 67, subcategories: ["Programozás", "3D nyomtatás", "Robotika"] },
  { name: "Állatok", emoji: "🐾", count: 45, subcategories: ["Kutyasétáltatás", "Akvarisztika", "Lovaglás"] },
  { name: "Irodalom & Tanulás", emoji: "📚", count: 53, subcategories: ["Könyvklub", "Nyelvtanulás", "Önfejlesztés"] },
  { name: "Tánc", emoji: "💃", count: 38, subcategories: ["Társastánc", "Salsa", "Hip-hop", "Balett"] },
  { name: "Utazás", emoji: "✈️", count: 76, subcategories: ["Hátizsákos", "Roadtrip", "Kulturális túra"] },
  { name: "Gaming", emoji: "🎮", count: 134, subcategories: ["PC", "PlayStation", "Xbox", "Retro"] },
  { name: "Divat & Szépség", emoji: "👗", count: 31, subcategories: ["Smink", "Öltözködés", "Szépségápolás"] },
  { name: "Önkéntesség", emoji: "🤝", count: 27, subcategories: ["Környezetvédelem", "Szociális", "Oktatás"] },
];

const Explore = () => {
  const [search, setSearch] = useState("");

  const filtered = hobbyCategories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(search.toLowerCase()) ||
      cat.subcategories.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-3">
            Fedezd fel a <span className="text-gradient">hobbidat</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">
            Válassz kategóriát, és találd meg azokat az embereket, akikkel közös a szenvedélyed.
          </p>
          <div className="relative max-w-md mx-auto">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Keress hobbit... pl. futás, festés, sakk"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group p-5 rounded-xl border bg-card hover-lift cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{cat.emoji}</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users size={12} />
                  {cat.count}
                </div>
              </div>
              <h3 className="font-display font-semibold mb-2">{cat.name}</h3>
              <div className="flex flex-wrap gap-1.5">
                {cat.subcategories.slice(0, 4).map((sub) => (
                  <Badge key={sub} variant="secondary" className="text-xs font-normal">
                    {sub}
                  </Badge>
                ))}
                {cat.subcategories.length > 4 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    +{cat.subcategories.length - 4}
                  </Badge>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Nem találtunk ilyen hobbit 😔</p>
            <p className="text-sm">Próbálj más keresőszót, vagy adj hozzá sajátot!</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Explore;
