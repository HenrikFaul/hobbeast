import { motion, useReducedMotion } from "framer-motion";
import { MapPin, CalendarDays, Users, Sparkles, Compass, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Közösségi matching",
    description: "Találj olyan embereket, akikkel tényleg jó együtt csinálni – legyen az túra, sport, kreatív műhely vagy egy közös vacsora.",
    card: "bg-primary text-primary-foreground lg:col-span-7",
    iconStyle: "bg-primary-foreground/15 text-primary-foreground",
    featured: true,
  },
  {
    icon: CalendarDays,
    title: "Éles eseményradar",
    description: "Böngéssz precíz, jól szervezett események között, és csatlakozz pár kattintással a számodra releváns programokhoz.",
    card: "bg-accent/[0.10] text-foreground lg:col-span-5",
    iconStyle: "bg-accent/20 text-accent",
  },
  {
    icon: MapPin,
    title: "Helyfüggő élmények",
    description: "A lokációalapú keresés nem csak hasznos, hanem gyors és fókuszált: pontosabban azt látod, ami valóban elérhető számodra.",
    card: "bg-card text-foreground lg:col-span-4",
    iconStyle: "bg-primary/10 text-primary",
  },
  {
    icon: Compass,
    title: "Felfedezés zaj nélkül",
    description: "Kevesebb random görgetés, több valódi találat. A felület úgy vezet végig, mint egy jól hangolt vezérlőpult.",
    card: "bg-muted text-foreground lg:col-span-4",
    iconStyle: "bg-background text-primary",
  },
  {
    icon: Sparkles,
    title: "Sokszínű élmények",
    description: "Túrától a teniszig, koncerttől a kutyasétáltatásig – egyetlen helyen minden hobbi és közös program, ami érdekel.",
    card: "bg-card text-foreground lg:col-span-4",
    iconStyle: "bg-accent/15 text-accent",
  },
  {
    icon: ShieldCheck,
    title: "Tisztább flow",
    description: "Erősebb vizuális hierarchia, letisztultabb CTA-k és jobb állapotkezelés úgy, hogy a meglévő működés közben stabil marad.",
    card: "bg-accent/[0.08] text-foreground lg:col-span-12",
    iconStyle: "bg-primary text-primary-foreground",
    wide: true,
  },
];

const FeaturesSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-muted/35 py-20 sm:py-24 lg:py-28">
      <div className="pointer-events-none absolute -right-28 top-24 h-80 w-80 rounded-full bg-accent/[0.10] blur-3xl" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55 }}
          className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-end lg:gap-12"
        >
          <div>
            <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/[0.10] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Amit kínálunk
            </div>
            <h2 className="mt-5 max-w-xl text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl lg:text-5xl">
              Miért működik másképp a <span className="text-primary">Hobbeast</span>?
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:justify-self-end">
            Nem túlbeszélt közösségi app, hanem egy fókuszált, energikus rendszer:
            felfedezéshez, kapcsolódáshoz és közös élményekhez.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={reduceMotion ? undefined : { y: -4 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.045 }}
              className={`group relative overflow-hidden rounded-[1.75rem] border border-border/70 p-6 shadow-[0_18px_50px_-38px_hsl(var(--foreground)/0.5)] sm:p-7 ${feature.card} ${feature.wide ? "sm:col-span-2" : ""}`}
            >
              <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full border border-current opacity-[0.07]" />
              <div className={feature.wide ? "sm:flex sm:items-center sm:gap-6" : ""}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${feature.iconStyle}`}>
                  <feature.icon size={22} aria-hidden="true" />
                </div>
                <div className={feature.wide ? "mt-5 sm:mt-0 sm:flex-1" : "mt-8"}>
                  <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${feature.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    0{index + 1}
                  </div>
                  <h3 className="font-display text-xl font-semibold tracking-[-0.015em]">
                    {feature.title}
                  </h3>
                  <p className={`mt-3 max-w-2xl text-sm leading-relaxed ${feature.featured ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
