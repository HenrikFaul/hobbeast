import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Users,
    eyebrow: "01 · Találkozás",
    title: "Ne csak kövess embereket. Találkozz velük.",
    description: "Közös érdeklődés, hasonló ritmus és valódi programok alapján kapcsolódhatsz — kínos hidegüzenetek nélkül.",
    className: "bg-[#183124] text-white sm:col-span-2 lg:col-span-7",
    iconClassName: "bg-[#dfff62] text-[#183124]",
    copyClassName: "text-white/[0.68]",
  },
  {
    icon: CalendarDays,
    eyebrow: "02 · Most történik",
    title: "Programok, amelyekhez tényleg odaérsz",
    description: "Gyorsan átlátható események dátum, férőhely, forrás és távolság szerint — saját Hobbeast és külső kínálattal.",
    className: "bg-[#ff8f72] text-[#2f1711] sm:col-span-2 lg:col-span-5",
    iconClassName: "bg-[#2f1711] text-[#ffb7a5]",
    copyClassName: "text-[#2f1711]/[0.72]",
  },
  {
    icon: MapPin,
    eyebrow: "03 · Közel hozzád",
    title: "A városod legyen a közös nappali",
    description: "Lokációalapú felfedezés, útvonaltervezés és helyszínjavaslat egyetlen folyamatban.",
    className: "bg-[#dfff62] text-[#183124] sm:col-span-1 lg:col-span-4",
    iconClassName: "bg-[#183124] text-[#dfff62]",
    copyClassName: "text-[#183124]/[0.68]",
  },
  {
    icon: Compass,
    eyebrow: "04 · Neked válogatva",
    title: "Kevesebb zaj. Több jó ötlet.",
    description: "Személyes ajánlások, kedvenc kategóriák és átlátható indoklás segítik a döntést.",
    className: "bg-[#c9b7ff] text-[#251b43] sm:col-span-1 lg:col-span-4",
    iconClassName: "bg-[#251b43] text-[#d9ceff]",
    copyClassName: "text-[#251b43]/[0.68]",
  },
  {
    icon: Sparkles,
    eyebrow: "05 · A te tempódban",
    title: "Hobbi minden hangulathoz",
    description: "Túrától a társasig, koncerttől a kreatív workshopig — részletes hobbi-katalógusból indulhatsz.",
    className: "bg-[#f5d46f] text-[#33250a] sm:col-span-1 lg:col-span-4",
    iconClassName: "bg-[#33250a] text-[#f5d46f]",
    copyClassName: "text-[#33250a]/[0.68]",
  },
  {
    icon: ShieldCheck,
    eyebrow: "06 · Biztonságosabb tér",
    title: "A jó hangulat mögött komoly védelem dolgozik",
    description: "Érkezési segítség, közösségi biztonsági eszközök, moderáció és adatvédelmi kontrollok kísérik a valódi találkozásokat.",
    className: "bg-card text-foreground sm:col-span-2 lg:col-span-12",
    iconClassName: "bg-primary text-primary-foreground",
    copyClassName: "text-muted-foreground",
    wide: true,
  },
];

const flowSteps = [
  ["01", "Válassz hangulatot", "Mit csinálnál szívesen?"],
  ["02", "Találj programot", "Szűrj úgy, ahogy neked jó."],
  ["03", "Menjetek együtt", "A chatből legyen közös emlék."],
];

const FeaturesSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] py-20 sm:py-24 lg:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-14 h-64 w-64 rounded-full border-[42px] border-[#c9b7ff]/20" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55 }}
          className="mb-11 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-16"
        >
          <div>
            <div className="inline-flex rotate-[-1.5deg] items-center rounded-full bg-[#dfff62] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.15em] text-[#183124]">
              Több mint egy eseménylista
            </div>
            <h2 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[4.25rem]">
              A hétvégéd nem egy feed.
              <span className="block text-primary">Menj, és éld meg.</span>
            </h2>
          </div>
          <div className="lg:pb-1">
            <p className="max-w-2xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
              A Hobbeast megtartja a részletes szűrést, a személyre szabást és a
              szervezői eszközöket, de mindezt könnyebb, emberibb felfedezési
              élménybe rendezi.
            </p>
            <Button asChild variant="ghost" className="mt-4 -ml-4 rounded-full text-primary">
              <Link to="/explore">
                Fedezd fel az összes hobbit <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={reduceMotion ? undefined : { y: -5, rotate: index === 1 ? 0.35 : 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.045 }}
              className={`group relative min-h-[300px] overflow-hidden rounded-[2rem] border border-black/[0.08] p-6 shadow-[0_22px_60px_-40px_rgba(25,45,31,0.5)] sm:p-8 ${feature.className} ${feature.wide ? "sm:min-h-0" : ""}`}
            >
              <div aria-hidden="true" className="absolute -right-12 -top-14 h-36 w-36 rounded-full border-[24px] border-current opacity-[0.07] transition-transform duration-500 group-hover:scale-110" />
              <div className={feature.wide ? "relative sm:flex sm:items-center sm:gap-7" : "relative flex h-full flex-col"}>
                <div className={`flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-[1.1rem] ${feature.iconClassName}`}>
                  <feature.icon size={23} aria-hidden="true" />
                </div>
                <div className={feature.wide ? "mt-6 sm:mt-0 sm:flex-1" : "mt-auto pt-16"}>
                  <p className="mb-3 text-[0.67rem] font-extrabold uppercase tracking-[0.16em] opacity-60">
                    {feature.eyebrow}
                  </p>
                  <h3 className={`font-display font-extrabold leading-[1.06] tracking-[-0.035em] ${feature.wide ? "text-2xl sm:text-3xl" : "text-2xl lg:text-[1.7rem]"}`}>
                    {feature.title}
                  </h3>
                  <p className={`mt-4 max-w-3xl text-sm font-medium leading-relaxed sm:text-base ${feature.copyClassName}`}>
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.55 }}
          className="mt-5 overflow-hidden rounded-[2rem] border border-border/70 bg-[#f1eee5] px-5 py-7 sm:px-8 sm:py-9 lg:px-10"
        >
          <div className="grid gap-6 md:grid-cols-3 md:gap-0">
            {flowSteps.map(([number, title, description], index) => (
              <div key={number} className={`relative flex gap-4 md:px-7 ${index === 0 ? "md:pl-0" : "md:border-l md:border-foreground/10"}`}>
                <span className="font-display text-3xl font-extrabold text-accent">{number}</span>
                <div>
                  <h3 className="font-display text-lg font-extrabold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;
