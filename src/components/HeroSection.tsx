import { motion, useReducedMotion } from "framer-motion";
import { Users, Sparkles, CalendarDays, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-community.jpg";

const stats = [
  { icon: Users, label: "Közösség", value: "10K+" },
  { icon: CalendarDays, label: "Aktív program", value: "500+" },
  { icon: Sparkles, label: "Hobbi kategória", value: "80+" },
];

const HeroSection = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden bg-background pb-14 pt-24 sm:pb-20 sm:pt-28 lg:pb-24 lg:pt-32">
      <div className="pointer-events-none absolute -left-28 top-16 h-72 w-72 rounded-full bg-accent/[0.12] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-primary/[0.10] blur-3xl" />

      <div className="container relative mx-auto px-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-[0_28px_90px_-48px_hsl(var(--foreground)/0.42)] sm:rounded-[2.5rem]">
          <div className="grid lg:min-h-[680px] lg:grid-cols-[1.02fr_0.98fr]">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="relative order-1 min-h-[270px] overflow-hidden sm:min-h-[360px] lg:order-2 lg:min-h-full"
            >
              <img
                src={heroImg}
                alt="Baráti közösség közös szabadtéri élményen"
                width={1600}
                height={900}
                loading="eager"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/45 via-transparent to-transparent lg:bg-gradient-to-r lg:from-card/35 lg:via-transparent lg:to-transparent" />

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/40 bg-white/80 p-3.5 text-foreground shadow-lg backdrop-blur-md sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-[21rem] sm:p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Sparkles size={17} aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Közösség élőben
                    </div>
                    <div className="mt-0.5 font-display text-sm font-semibold leading-snug sm:text-base">
                      Valódi emberek. Valódi élmények. Együtt.
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="order-2 flex flex-col justify-center px-5 py-9 sm:px-9 sm:py-12 lg:order-1 lg:px-12 lg:py-16 xl:px-16"
            >
              <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-4 py-2 text-sm font-semibold text-primary">
                <Sparkles size={14} aria-hidden="true" />
                Találd meg a közösséged
              </div>

              <h1 className="max-w-2xl text-balance font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[3.6rem] xl:text-[4.15rem]">
                Élj át többet együtt –
                <span className="mt-2 block text-primary">
                  találj társakat a közös élményekhez
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                A Hobbeast egy modern közösségi vezérlőpult: legyen szó túráról,
                közös koncertről, teniszről, kutyasétáltatásról vagy bármilyen
                hobbiról – itt valódi embereket találsz, akikkel együtt csinálhatod.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  size="lg"
                  className="h-12 rounded-full px-7 text-base font-semibold sm:px-8"
                  onClick={() => navigate("/events")}
                >
                  Indítsd a keresést
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-border/90 bg-background/55 px-7 text-base sm:px-8"
                  onClick={() => navigate("/about")}
                >
                  Mi ez pontosan?
                </Button>
              </div>

              <div className="mt-9 grid grid-cols-3 gap-2 border-t border-border/70 pt-6 sm:gap-4">
                {stats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.32 + index * 0.07 }}
                    className="min-w-0"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-primary sm:h-9 sm:w-9">
                      <stat.icon size={15} aria-hidden="true" />
                    </div>
                    <div className="font-display text-xl font-bold leading-none text-foreground sm:text-2xl">
                      {stat.value}
                    </div>
                    <div className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:text-xs sm:tracking-[0.12em]">
                      {stat.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
