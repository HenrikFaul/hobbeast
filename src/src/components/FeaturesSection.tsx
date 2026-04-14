import { motion } from "framer-motion";
import { MapPin, CalendarDays, Users, Sparkles, Compass, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Közösségi matching",
    description: "Találj olyan embereket, akik nem csak hasonló érdeklődésűek, hanem tényleg ugyanazt a hangulatot keresik, mint te.",
    color: "bg-primary/12 text-primary",
  },
  {
    icon: CalendarDays,
    title: "Éles eseményradar",
    description: "Böngéssz precíz, jól szervezett események között, és csatlakozz pár kattintással a számodra releváns programokhoz.",
    color: "bg-accent/12 text-accent",
  },
  {
    icon: MapPin,
    title: "Helyfüggő élmények",
    description: "A lokációalapú keresés nem csak hasznos, hanem gyors és fókuszált: pontosabban azt látod, ami valóban elérhető számodra.",
    color: "bg-primary/12 text-primary",
  },
  {
    icon: Compass,
    title: "Felfedezés zaj nélkül",
    description: "Kevesebb random görgetés, több valódi találat. A felület úgy vezet végig, mint egy jól hangolt vezérlőpult.",
    color: "bg-accent/12 text-accent",
  },
  {
    icon: Sparkles,
    title: "Premium vibe",
    description: "Sötét, modern, techno-inspirált felület, ami nem játékosnak, hanem karakteresnek és magabiztosnak érződik.",
    color: "bg-primary/12 text-primary",
  },
  {
    icon: ShieldCheck,
    title: "Tisztább flow",
    description: "Erősebb vizuális hierarchia, letisztultabb CTA-k és jobb állapotkezelés úgy, hogy a meglévő működés közben stabil marad.",
    color: "bg-accent/12 text-accent",
  },
];

const FeaturesSection = () => {
  return (
    <section className="section-padding relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-20 pointer-events-none" />
      <div className="absolute inset-0 gradient-warm pointer-events-none" />
      <div className="absolute inset-x-0 top-0 neon-divider opacity-50" />

      <div className="container mx-auto px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-medium text-accent mb-5 uppercase tracking-[0.2em]">
            Core systems
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-display mb-4">
            Miért működik másképp a <span className="text-gradient">Hobbeast</span>?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
            Nem túlbeszélt közösségi app, hanem egy fókuszált, energikus rendszer:
            felfedezéshez, kapcsolódáshoz és közös élményekhez.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="group rounded-[1.4rem] chrome-panel gradient-border p-6 md:p-8"
            >
              <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${feature.color} transition-transform duration-300 group-hover:scale-110`}>
                <feature.icon size={22} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-3 text-chrome">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              <div className="mt-6 neon-divider opacity-60" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
