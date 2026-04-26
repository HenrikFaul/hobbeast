import { motion } from "framer-motion";
import { Heart, Target, Lightbulb, Users, TrendingUp } from "lucide-react";

const About = () => {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-20 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 shadow-soft">
            <Heart size={14} />
            Rólunk
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-6 leading-tight">
            Élmény, közösség, barátok, <span className="text-gradient">értékek</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A Hobbeast küldetése, hogy segítse az embereket egy nyitottabb világban élni.
            Hiszünk abban, hogy a közös érdeklődés és élmények az igazi barátságok alapjai.
          </p>
        </motion.div>

        {/* Mission cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 mb-20">
          {[
            {
              icon: Target,
              title: "Küldetésünk",
              text: "Összekötni az embereket közös hobbik és élmények mentén, hogy senki ne érezze magát egyedül.",
              color: "bg-primary/10 text-primary",
            },
            {
              icon: Lightbulb,
              title: "Víziónk",
              text: "Egy világ, ahol bárki könnyedén talál társat egy új hobbi kipróbálásához, legyen szó sportról, művészetről vagy kalandról.",
              color: "bg-accent/10 text-accent",
            },
            {
              icon: Users,
              title: "Értékeink",
              text: "Nyitottság, befogadás, közösség. Mindenkit szívesen látunk, aki nyitott az új élményekre és emberekre.",
              color: "bg-success/10 text-success",
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="card-premium p-6 md:p-8"
            >
              <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center mb-5`}>
                <item.icon size={22} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-3">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Problem & Solution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl gradient-warm border border-border/50 p-6 sm:p-10 md:p-14 mb-20"
        >
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-14">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium mb-4">
                A kihívás
              </div>
              <h2 className="font-display text-2xl font-bold mb-5">A probléma</h2>
              <ul className="space-y-4 text-muted-foreground text-sm">
                {[
                  "Az emberek nehezen elégítik ki a közösséghez tartozás igényét",
                  "Nehezen találnak partnereket közös sportokhoz és hobbihoz",
                  "Lemondanak új dolgok kipróbálásáról, mert nincs kivel",
                  "Időigényes és energiaigényes az érdeklődésnek megfelelő programok keresése",
                  "A kínálati oldal nehezen találja meg az érdeklődőket",
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium mb-4">
                A válasz
              </div>
              <h2 className="font-display text-2xl font-bold mb-5">A megoldás</h2>
              <ul className="space-y-4 text-muted-foreground text-sm">
                {[
                  "Közösségépítés és események tárháza egy helyen",
                  "Érdeklődési körök alapján célzott ajánlások",
                  "Egyszerű és gyors: percek alatt megtalálod a társadat",
                  "Események és felhasználók külön kereshetőek",
                  "Szolgáltatók direkt sales lehetőséget kapnak",
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Survey data */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 tracking-wide uppercase">
            <TrendingUp size={14} />
            Kérdőív eredmények
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-10">Kérdőívünk eredményei</h2>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { value: "88.3%", label: "fontosnak tartja a sporttevékenységet", bar: 88.3 },
              { value: "64.5%", label: "jobban szeret társaságban sportolni", bar: 64.5 },
              { value: "16.9%", label: "nem talált még társat", bar: 16.9 },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card-premium p-6"
              >
                <div className="text-3xl sm:text-4xl font-bold font-display text-gradient mb-3">{stat.value}</div>
                <div className="w-full h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${stat.bar}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.3 + i * 0.1 }}
                    className="h-full rounded-full gradient-primary"
                  />
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">{stat.label}</div>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6">446 válaszadó, többnyire 15-29 éves korosztály</p>
        </motion.div>

      </div>
    </main>
  );
};

export default About;
