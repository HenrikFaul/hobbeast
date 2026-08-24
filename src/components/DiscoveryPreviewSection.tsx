import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck2,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

const discoveryEntrypoints = [
  {
    icon: Sparkles,
    label: "Neked válogatva",
    detail: "Érdeklődés és korábbi jelzések alapján",
    path: "/events?mode=personal",
    tone: "bg-[#dfff62] text-[#183124]",
  },
  {
    icon: CalendarCheck2,
    label: "Van még hely",
    detail: "Csatlakozható, közelgő programok",
    path: "/events?capacity=available",
    tone: "bg-[#ff8f72] text-[#2f1711]",
  },
  {
    icon: SlidersHorizontal,
    label: "Kategóriák szerint",
    detail: "A részletes hobbi-katalógusból",
    path: "/events?mode=categories",
    tone: "bg-[#c9b7ff] text-[#251b43]",
  },
];

const quickQueries = ["túra", "társasjáték", "zene", "kreatív"];

const DiscoveryPreviewSection = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const openSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    navigate(trimmed ? `/events?q=${encodeURIComponent(trimmed)}&mode=search` : "/events");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openSearch(query);
  };

  const openCreate = () => {
    const target = "/events?create=1";
    navigate(user ? target : `/auth?redirect=${encodeURIComponent(target)}`);
  };

  return (
    <section className="relative overflow-hidden bg-[#251b43] py-20 text-white sm:py-24 lg:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-10 h-72 w-72 rounded-full bg-[#c9b7ff]/[0.16] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[#ff8f72]/[0.18] blur-3xl" />

      <div className="container relative mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: -22 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.58 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#dfff62]">
              <MapPin size={14} aria-hidden="true" /> Indulj a közeledből
            </div>
            <h2 className="mt-6 max-w-2xl font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-[4.4rem]">
              Mihez lenne
              <span className="block text-[#ff8f72]">kedved most?</span>
            </h2>
            <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/[0.66] sm:text-lg">
              Ne egy végtelen listából indulj. Keress rá egy hangulatra, válassz
              személyes nézetet, vagy szűrj a Hobbeast teljes eszköztárával.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 rounded-[1.55rem] border border-white/15 bg-white/10 p-2 backdrop-blur-md sm:flex sm:items-center sm:gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#dfff62]" aria-hidden="true" />
                <Input
                  aria-label="Program vagy hobbi keresése"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="pl. túra, társas, koncert…"
                  className="h-[3.25rem] border-0 bg-transparent pl-12 text-base text-white shadow-none placeholder:text-white/[0.46] focus-visible:ring-[#dfff62]"
                />
              </div>
              <Button type="submit" className="mt-2 h-12 w-full rounded-full border-[#dfff62] bg-[#dfff62] px-6 font-bold text-[#183124] hover:bg-[#e7ff8b] sm:mt-0 sm:w-auto">
                Keresés <ArrowRight aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {quickQueries.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => openSearch(item)}
                  className="min-h-10 rounded-full border border-white/15 px-3.5 text-sm font-semibold text-white/[0.72] transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
                >
                  {item}
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 26, rotate: 1 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.62 }}
            className="relative rounded-[2rem] bg-[#fffdf7] p-4 text-[#183124] shadow-[0_34px_90px_-40px_rgba(0,0,0,0.72)] sm:rounded-[2.5rem] sm:p-6"
          >
            <div aria-hidden="true" className="absolute -right-5 -top-5 flex h-20 w-20 rotate-12 items-center justify-center rounded-full bg-[#dfff62] font-display text-sm font-extrabold text-[#183124] shadow-xl">
              Itt és
              <br />most ✦
            </div>

            <div className="mb-5 flex items-center justify-between gap-4 pr-14">
              <div>
                <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-primary">Felfedezés</p>
                <h3 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Találd meg a saját nézeted</h3>
              </div>
            </div>

            <div className="space-y-3">
              {discoveryEntrypoints.map((item, index) => (
                <motion.button
                  key={item.label}
                  type="button"
                  whileHover={reduceMotion ? undefined : { x: 5 }}
                  onClick={() => navigate(item.path)}
                  className="group flex min-h-[92px] w-full items-center gap-4 rounded-[1.45rem] border border-[#183124]/10 bg-white p-3.5 text-left shadow-[0_14px_35px_-28px_rgba(24,49,36,0.55)] transition-colors hover:border-[#183124]/20 sm:p-4"
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}>
                    <item.icon size={21} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-display text-base font-extrabold sm:text-lg">{item.label}</span>
                    <span className="mt-0.5 block text-xs font-medium text-[#183124]/[0.55] sm:text-sm">{item.detail}</span>
                  </span>
                  <span className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#183124]/5 transition-colors group-hover:bg-[#183124] group-hover:text-white">
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </motion.button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[1.45rem] bg-[#edf0e7] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-primary"><Users size={18} aria-hidden="true" /></span>
                <div>
                  <p className="text-sm font-extrabold">Nem találtad? Indíts sajátot.</p>
                  <p className="text-xs text-[#183124]/[0.55]">A szervezői eszközök végig segítenek.</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={openCreate} className="rounded-full border-[#183124]/15 bg-white">
                Programot szervezek
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default DiscoveryPreviewSection;
