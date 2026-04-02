import { motion } from "framer-motion";
import { Heart, Lightbulb, Target, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

const About = () => {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 page-stack">
        <PageHeader
          eyebrow="Rólunk"
          title="Élmény, közösség, barátok, értékek."
          subtitle="A Hobbeast küldetése, hogy az emberek könnyebben találjanak egymásra a közös érdeklődésükön keresztül. A közösséghez tartozás, a kipróbálható élmények és az új kapcsolatok egyszerre jelennek meg a platformon."
          align="center"
          stats={
            <div className="grid w-full gap-3 sm:grid-cols-3">
              {[
                { label: "válaszadó", value: "446" },
                { label: "sport társaságban", value: "64.5%" },
                { label: "fontos a sport", value: "88.3%" },
              ].map((item) => (
                <div key={item.label} className="metric-tile">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
                  <div className="mt-2 font-display text-2xl font-bold">{item.value}</div>
                </div>
              ))}
            </div>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Target,
              title: "Küldetésünk",
              text: "Összekötni az embereket közös hobbik és élmények mentén, hogy senki ne érezze magát egyedül.",
              tone: "bg-primary/10 text-primary",
            },
            {
              icon: Lightbulb,
              title: "Víziónk",
              text: "Egy olyan világ, ahol egy új hobbi kipróbálása nem logisztikai akadály, hanem természetes közösségi élmény.",
              tone: "bg-accent/10 text-accent",
            },
            {
              icon: Users,
              title: "Értékeink",
              text: "Nyitottság, befogadás és kapcsolódás - mindenkit várunk, aki szívesen találkozik új emberekkel és új élményekkel.",
              tone: "bg-success/10 text-success",
            },
          ].map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card className="h-full rounded-[1.75rem] border-border/70 bg-card/80 shadow-card">
                <CardContent className="p-6">
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h2 className="font-display text-xl font-semibold">{item.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="rounded-[2rem] border-border/70 bg-card/80 shadow-card">
            <CardContent className="p-6 sm:p-8">
              <div className="hero-chip mb-3">a probléma</div>
              <h2 className="section-title">Miért van szükség ilyen platformra?</h2>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
                <li>- Az emberek nehezen elégítik ki a közösséghez tartozás igényét.</li>
                <li>- Nem egyszerű partnert találni közös sporthoz vagy hobbihoz.</li>
                <li>- Sok új dolog kipróbálása elmarad, mert nincs kivel.</li>
                <li>- Időigényes az érdeklődéshez illő programok és emberek megtalálása.</li>
                <li>- A kínálati oldal nehezen találja meg az érdeklődő közösséget.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-border/70 bg-card/80 shadow-card">
            <CardContent className="p-6 sm:p-8">
              <div className="hero-chip mb-3">a megoldás</div>
              <h2 className="section-title">Mit ad erre a Hobbeast?</h2>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
                <li>- Közösségépítés és események tárháza egy helyen.</li>
                <li>- Érdeklődés és lokáció alapján célzott ajánlások.</li>
                <li>- Gyorsabb út a kereséstől a részvételig.</li>
                <li>- Felhasználók, események és helyszínek összekapcsolt kezelése.</li>
                <li>- Szervezői és üzleti oldalon is használható, karbantartható flow.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-[2rem] border-border/70 bg-card/80 shadow-card">
          <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="hero-chip mb-3">kutatási háttér</div>
              <h2 className="section-title">Kérdőívből validált igény</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                A kutatási eredmények azt mutatják, hogy a közös mozgás, az élményalapú találkozás és az
                új emberekkel való kapcsolódás valós, megoldandó igény. A Hobbeast ezt a problémát nem
                absztrakt közösségi feedként, hanem cselekvésközpontú platformként kezeli.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { value: "88.3%", label: "fontosnak tartja a sporttevékenységet" },
                { value: "64.5%", label: "jobban szeret társaságban sportolni" },
                { value: "16.9%", label: "nem talált még társat" },
              ].map((stat) => (
                <div key={stat.label} className="metric-tile">
                  <div className="font-display text-3xl font-bold text-gradient">{stat.value}</div>
                  <div className="mt-2 text-xs leading-6 text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border/70 bg-card/80 shadow-card">
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <div className="hero-chip mb-3">emberközpontú platform</div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                A közös élményekből lesznek az igazi barátságok.
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Heart className="h-4 w-4" />
              Hobbeast value proposition
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default About;
