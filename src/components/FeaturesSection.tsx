import { motion } from "framer-motion";
import { Compass, Calendar, MessageCircle, Star, Shield, Zap } from "lucide-react";

const features = [
  {
    icon: Compass,
    title: "Fedezz fel hobbikat",
    description: "Válassz 80+ hobbi kategóriából, vagy adj hozzá sajátot. A rendszer személyre szabott ajánlásokat ad.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Calendar,
    title: "Események egy helyen",
    description: "Szervezz vagy csatlakozz szabadidős programokhoz a közeledben. Sportolás, túrázás, társasozás – bármi!",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: MessageCircle,
    title: "Közösségi chat",
    description: "Beszélgess hasonló érdeklődésű emberekkel. Csoportos vagy privát üzenetek, egyszerűen.",
    color: "bg-success/10 text-success",
  },
  {
    icon: Star,
    title: "Értékelések",
    description: "Eseményeket és felhasználókat is értékelhetsz, hogy a közösség mindig minőségi legyen.",
    color: "bg-warning/10 text-warning",
  },
  {
    icon: Shield,
    title: "Biztonságos közösség",
    description: "Profilok ellenőrzése és moderált tartalom, hogy mindenki jól érezze magát.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Zap,
    title: "Gyors és egyszerű",
    description: "Regisztráció után perceken belül megtalálhatod a hozzád illő közösséget és programokat.",
    color: "bg-accent/10 text-accent",
  },
];

const FeaturesSection = () => {
  return (
    <section className="py-20 bg-card">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl sm:text-4xl font-bold font-display mb-4">
            Miért a <span className="text-gradient">Hobbeast</span>?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Minden, amit egy alkalmazás adhat – közösségépítés, események és élmények egy helyen.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group p-6 rounded-xl border bg-card hover-lift cursor-default"
            >
              <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
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
