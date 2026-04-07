import { motion } from "framer-motion";
import { Compass, Calendar, MessageCircle, Star, Shield, Zap } from "lucide-react";

const features = [
  {
    icon: Compass,
    title: "Fedezz fel hobbikat",
    description: "Válassz 80+ hobbi kategóriából, vagy adj hozzá sajátot. A rendszer személyre szabott ajánlásokat ad.",
    color: "bg-primary/10 text-primary",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
  },
  {
    icon: Calendar,
    title: "Események egy helyen",
    description: "Szervezz vagy csatlakozz szabadidős programokhoz a közeledben. Sportolás, túrázás, társasozás – bármi!",
    color: "bg-accent/10 text-accent",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--accent)/0.15)]",
  },
  {
    icon: MessageCircle,
    title: "Közösségi chat",
    description: "Beszélgess hasonló érdeklődésű emberekkel. Csoportos vagy privát üzenetek, egyszerűen.",
    color: "bg-success/10 text-success",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--success)/0.15)]",
  },
  {
    icon: Star,
    title: "Értékelések",
    description: "Eseményeket és felhasználókat is értékelhetsz, hogy a közösség mindig minőségi legyen.",
    color: "bg-warning/10 text-warning",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--warning)/0.15)]",
  },
  {
    icon: Shield,
    title: "Biztonságos közösség",
    description: "Profilok ellenőrzése és moderált tartalom, hogy mindenki jól érezze magát.",
    color: "bg-primary/10 text-primary",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
  },
  {
    icon: Zap,
    title: "Gyors és egyszerű",
    description: "Regisztráció után perceken belül megtalálhatod a hozzád illő közösséget és programokat.",
    color: "bg-accent/10 text-accent",
    accent: "group-hover:shadow-[0_0_0_1px_hsl(var(--accent)/0.15)]",
  },
];

const FeaturesSection = () => {
  return (
    <section className="section-padding bg-card relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/[0.02] blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 tracking-wide uppercase">
            Funkciók
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-display mb-4">
            Miért a <span className="text-gradient">Hobbeast</span>?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
            Minden, amit egy alkalmazás adhat – közösségépítés, események és élmények egy helyen.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`group card-premium p-6 md:p-8 cursor-default ${feature.accent}`}
            >
              <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
                <feature.icon size={22} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
