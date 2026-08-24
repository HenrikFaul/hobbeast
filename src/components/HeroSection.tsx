import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Bike,
  MapPin,
  Music2,
  Palette,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-community-v2.webp";
import heroFallback from "@/assets/hero-community.jpg";

const quickStarts = [
  {
    icon: Bike,
    eyebrow: "Mozdulj ki",
    title: "Sport & természet",
    path: "/events?q=túra&mode=search",
    tone: "bg-[#dfff62] text-[#183124]",
  },
  {
    icon: Palette,
    eyebrow: "Alkoss együtt",
    title: "Kreatív programok",
    path: "/events?q=kreatív&mode=search",
    tone: "bg-[#ff8f72] text-[#2f1711]",
  },
  {
    icon: Music2,
    eyebrow: "Kapcsolódj",
    title: "Zene & városi esték",
    path: "/events?q=zene&mode=search",
    tone: "bg-[#c9b7ff] text-[#251b43]",
  },
];

const HeroSection = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden px-3 pb-10 pt-[5.75rem] sm:px-5 sm:pb-14 sm:pt-[6.5rem]">
      <div className="pointer-events-none absolute -left-40 top-24 -z-10 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto min-h-[760px] max-w-[92rem] overflow-hidden rounded-[2rem] bg-[#12251c] shadow-[0_36px_100px_-42px_rgba(13,35,24,0.72)] sm:min-h-[790px] sm:rounded-[2.75rem] lg:min-h-[820px]"
      >
        <picture className="absolute inset-0">
          <source srcSet={heroImg} type="image/webp" />
          <img
            src={heroFallback}
            alt="Barátok közös szabadtéri programra érkeznek Budapesten"
            width={1536}
            height={1024}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[61%_center] sm:object-[58%_center] lg:object-center"
          />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,27,18,0.96)_0%,rgba(8,27,18,0.84)_35%,rgba(8,27,18,0.26)_70%,rgba(8,27,18,0.08)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,24,16,0.18)_0%,transparent_42%,rgba(8,24,16,0.88)_100%)]" />
        <div aria-hidden="true" className="absolute -left-20 -top-28 h-72 w-72 rounded-full border-[52px] border-[#dfff62]/20" />

        <div className="relative flex min-h-[760px] flex-col px-5 pb-5 pt-8 sm:min-h-[790px] sm:px-9 sm:pb-8 sm:pt-10 lg:min-h-[820px] lg:px-14 lg:pb-10 lg:pt-12 xl:px-20">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md sm:text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#dfff62] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#dfff62]" />
              </span>
              Budapest · közösség élőben
            </div>

            <button
              type="button"
              onClick={() => navigate("/explore")}
              className="hidden min-h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:inline-flex"
            >
              Hobbik felfedezése
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-16 max-w-[47rem] sm:mt-20 lg:mt-24">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="mb-5 flex items-center gap-2 text-sm font-semibold text-white/[0.78]"
            >
              <Sparkles size={16} className="text-[#dfff62]" aria-hidden="true" />
              Több közös élmény. Kevesebb üres görgetés.
            </motion.div>

            <motion.h1
              aria-label="Találd meg a te embereidet."
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-4xl font-display text-[3.15rem] font-extrabold leading-[0.9] tracking-[-0.065em] text-white sm:text-[4.5rem] lg:text-[5.85rem] xl:text-[6.8rem]"
            >
              Találd meg
              <span className="block text-[#dfff62]">a te embereidet.</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.32 }}
              className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/[0.78] sm:text-lg lg:text-xl"
            >
              Fedezz fel helyi programokat, találj társakat a kedvenc hobbidhoz,
              vagy indíts saját eseményt. A Hobbeastben az online érdeklődésből
              valódi találkozás lesz.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.4 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <Button
                size="lg"
                className="h-[3.25rem] rounded-full border-[#dfff62] bg-[#dfff62] px-7 text-base font-bold text-[#183124] shadow-[0_18px_40px_-20px_rgba(223,255,98,0.9)] hover:bg-[#e7ff8b] sm:px-8"
                onClick={() => navigate("/events")}
              >
                Programot keresek
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-[3.25rem] rounded-full border-white/30 bg-white/10 px-7 text-base font-semibold text-white shadow-none backdrop-blur-md hover:border-white/45 hover:bg-white/20 hover:text-white sm:px-8"
                onClick={() => navigate("/about")}
              >
                Így működik
              </Button>
            </motion.div>
          </div>

          <div className="mt-auto pt-14">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/[0.65]">
              <MapPin size={14} className="text-[#dfff62]" aria-hidden="true" />
              Mivel kezdenéd?
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3 lg:max-w-[61rem]">
              {quickStarts.map((item, index) => (
                <motion.button
                  key={item.title}
                  type="button"
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.48 + index * 0.07 }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  onClick={() => navigate(item.path)}
                  className="group flex min-h-[76px] items-center gap-3 rounded-[1.35rem] border border-white/20 bg-black/25 p-3 text-left text-white backdrop-blur-xl transition-colors hover:bg-black/40 sm:min-h-[92px] sm:p-4"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}>
                    <item.icon size={20} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.64rem] font-bold uppercase tracking-[0.13em] text-white/[0.55]">
                      {item.eyebrow}
                    </span>
                    <span className="mt-1 block font-display text-sm font-bold leading-tight sm:text-base">
                      {item.title}
                    </span>
                  </span>
                  <ArrowUpRight className="ml-auto hidden h-4 w-4 shrink-0 text-white/[0.45] transition-colors group-hover:text-[#dfff62] lg:block" aria-hidden="true" />
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, rotate: 4, scale: 0.9 }}
          animate={{ opacity: 1, rotate: -3, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.62 }}
          className="absolute right-8 top-28 hidden rounded-[1.35rem] bg-[#ff8f72] px-5 py-4 text-[#2f1711] shadow-xl xl:block"
          aria-hidden="true"
        >
          <span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.14em]">Nyitott társaság</span>
          <span className="mt-0.5 block font-display text-lg font-extrabold">Gyere úgy, ahogy vagy ✦</span>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
