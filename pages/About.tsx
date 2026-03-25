import { motion } from "framer-motion";
import { Heart, Target, Lightbulb, Users } from "lucide-react";

const About = () => {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Heart size={14} />
            Rólunk
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-6">
            Élmény, közösség, barátok, <span className="text-gradient">értékek</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A Hobbeast küldetése, hogy segítse az embereket egy nyitottabb világban élni.
            Hiszünk abban, hogy a közös érdeklődés és élmények az igazi barátságok alapjai.
          </p>
        </motion.div>

        {/* Mission cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
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
              className="p-6 rounded-xl border bg-card"
            >
              <div className={`w-12 h-12 rounded-lg ${item.color} flex items-center justify-center mb-4`}>
                <item.icon size={22} />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Problem & Solution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl gradient-warm border p-8 md:p-12 mb-16"
        >
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <h2 className="font-display text-2xl font-bold mb-4">A probléma</h2>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex gap-2"><span className="text-destructive">•</span> Az emberek nehezen elégítik ki a közösséghez tartozás igényét</li>
                <li className="flex gap-2"><span className="text-destructive">•</span> Nehezen találnak partnereket közös sportokhoz és hobbihoz</li>
                <li className="flex gap-2"><span className="text-destructive">•</span> Lemondanak új dolgok kipróbálásáról, mert nincs kivel</li>
                <li className="flex gap-2"><span className="text-destructive">•</span> Időigényes és energiaigényes az érdeklődésnek megfelelő programok keresése</li>
                <li className="flex gap-2"><span className="text-destructive">•</span> A kínálati oldal nehezen találja meg az érdeklődőket</li>
              </ul>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold mb-4">A megoldás</h2>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex gap-2"><span className="text-success">•</span> Közösségépítés és események tárháza egy helyen</li>
                <li className="flex gap-2"><span className="text-success">•</span> Érdeklődési körök alapján célzott ajánlások</li>
                <li className="flex gap-2"><span className="text-success">•</span> Egyszerű és gyors: percek alatt megtalálod a társadat</li>
                <li className="flex gap-2"><span className="text-success">•</span> Események és felhasználók külön kereshetőek</li>
                <li className="flex gap-2"><span className="text-success">•</span> Szolgáltatók direkt sales lehetőséget kapnak</li>
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
          <h2 className="font-display text-2xl font-bold mb-8">Kérdőívünk eredményei</h2>
          <div className="grid sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              { value: "88.3%", label: "fontosnak tartja a sporttevékenységet" },
              { value: "64.5%", label: "jobban szeret társaságban sportolni" },
              { value: "16.9%", label: "nem talált még társat" },
            ].map((stat) => (
              <div key={stat.label} className="p-5 rounded-xl border bg-card">
                <div className="text-3xl font-bold font-display text-gradient mb-2">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">446 válaszadó, többnyire 15-29 éves korosztály</p>
        </motion.div>

      </div>
    </main>
  );
};

export default About;
