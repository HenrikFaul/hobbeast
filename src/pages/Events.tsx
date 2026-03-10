import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const eventData = [
  {
    id: 1,
    title: "Vasárnapi futóklub a Városligetben",
    category: "Sport",
    location: "Budapest, Városliget",
    date: "2026. márc. 15.",
    time: "08:00",
    attendees: 23,
    maxAttendees: 40,
    image: "🏃",
    tags: ["Futás", "Reggeli", "Kezdő-barát"],
  },
  {
    id: 2,
    title: "Board Game Night – Társasest",
    category: "Társasjátékok",
    location: "Budapest, Szimpla Kert",
    date: "2026. márc. 16.",
    time: "18:00",
    attendees: 12,
    maxAttendees: 20,
    image: "🎲",
    tags: ["Társasozás", "Esti program"],
  },
  {
    id: 3,
    title: "Akrilfestés workshop kezdőknek",
    category: "Kreatív",
    location: "Budapest, Művész Stúdió",
    date: "2026. márc. 18.",
    time: "16:00",
    attendees: 8,
    maxAttendees: 12,
    image: "🎨",
    tags: ["Festés", "Workshop", "Kezdő"],
  },
  {
    id: 4,
    title: "Buda Hills túra – tavaszi kirándulás",
    category: "Természet",
    location: "Budapest, Normafa",
    date: "2026. márc. 20.",
    time: "09:00",
    attendees: 31,
    maxAttendees: 50,
    image: "🏔️",
    tags: ["Kirándulás", "Természet", "Közepesen nehéz"],
  },
  {
    id: 5,
    title: "Akusztikus jam session",
    category: "Zene",
    location: "Wien, Café Prückel",
    date: "2026. márc. 22.",
    time: "19:30",
    attendees: 6,
    maxAttendees: 15,
    image: "🎸",
    tags: ["Gitár", "Jam", "Nyitott"],
  },
  {
    id: 6,
    title: "Street Food & Cooking Challenge",
    category: "Gasztronómia",
    location: "Budapest, Bálna",
    date: "2026. márc. 23.",
    time: "11:00",
    attendees: 18,
    maxAttendees: 30,
    image: "👨‍🍳",
    tags: ["Főzés", "Verseny", "Street Food"],
  },
];

const Events = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(eventData.map((e) => e.category))];

  const filtered = eventData.filter((ev) => {
    const matchSearch = ev.title.toLowerCase().includes(search.toLowerCase()) ||
      ev.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = !selectedCategory || ev.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-3">
            Közelgő <span className="text-gradient">események</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">
            Csatlakozz programokhoz a közeledben, vagy szervezz sajátot!
          </p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 items-center justify-center">
          <div className="relative w-full sm:w-80">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Keress eseményt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button
              size="sm"
              variant={!selectedCategory ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              className={!selectedCategory ? "gradient-primary text-primary-foreground border-0" : ""}
            >
              Mind
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat)}
                className={selectedCategory === cat ? "gradient-primary text-primary-foreground border-0" : ""}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Event cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl border bg-card overflow-hidden hover-lift group cursor-pointer"
            >
              <div className="h-32 gradient-warm flex items-center justify-center">
                <span className="text-5xl">{event.image}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs">{event.category}</Badge>
                </div>
                <h3 className="font-display font-semibold text-lg mb-3 group-hover:text-primary transition-colors">
                  {event.title}
                </h3>
                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>{event.date}</span>
                    <Clock size={14} className="ml-2" />
                    <span>{event.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={14} />
                    <span>{event.attendees}/{event.maxAttendees} résztvevő</span>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-4">
                  {event.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <Button className="w-full gradient-primary text-primary-foreground border-0" size="sm">
                  Csatlakozom
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Nincs találat 😔</p>
            <p className="text-sm">Próbálj más szűrőfeltételeket!</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Events;
