import { motion } from "framer-motion";
import { ArrowRight, Heart, Target, Lightbulb, Users, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import dogwalkingFriends from "@/assets/editorial/about-nepsziget-dogwalk.webp";
import ResearchClaimCard from "@/components/ResearchClaimCard";
import { ABOUT_CTA_COPY, ABOUT_VISION_COPY } from "@/content/marketingCopy";
import { useResearchClaimSlot } from "@/features/research-claims/useResearchClaimSlot";

const About = () => {
  const claimSlot = useResearchClaimSlot("about", 3);

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

        <section
          aria-labelledby="belonging-heading"
          className="relative mb-20 overflow-hidden rounded-[2rem] bg-[#183124] p-4 text-white shadow-[0_28px_80px_-42px_rgba(24,49,36,0.7)] sm:rounded-[2.75rem] sm:p-6 lg:p-8"
        >
          <div aria-hidden="true" className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[44px] border-[#dfff62]/15" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12">
            <figure className="relative min-h-[20rem] overflow-hidden rounded-[1.5rem_3.75rem_1.75rem_2.75rem] sm:min-h-[28rem]">
              <img
                src={dogwalkingFriends}
                alt="Barátok kutyát sétáltatnak egy zöld Duna-parti ösvényen"
                width={1280}
                height={853}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <figcaption className="absolute bottom-4 left-4 rotate-[-2deg] rounded-full border-2 border-[#183124] bg-[#ff8f72] px-4 py-2 text-sm font-extrabold text-[#2f1711] shadow-xl sm:bottom-6 sm:left-6">
                kint jobb együtt
              </figcaption>
            </figure>

            <div className="px-1 pb-5 sm:px-4 sm:pb-7 lg:py-8 lg:pr-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#dfff62]">A Hobbeast-érzés</p>
              <h2 id="belonging-heading" className="mt-4 max-w-xl font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                Nem kell kész társasággal érkezned.
              </h2>
              <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-white/[0.72] sm:text-lg">
                Elég egy kíváncsiság, egy szabad délután vagy egy régi hobbi. Mi segítünk megtalálni azt a közeget, ahol természetes bekapcsolódni.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/explore"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#dfff62] px-5 py-2.5 text-sm font-extrabold text-[#183124] transition-colors hover:bg-[#e7ff8b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#183124]"
                >
                  {ABOUT_CTA_COPY.heading} <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to="/events"
                  className="inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff62] focus-visible:ring-offset-2 focus-visible:ring-offset-[#183124]"
                >
                  Nézd meg a programokat
                </Link>
              </div>
            </div>
          </div>
        </section>

        {claimSlot === 0 && <ResearchClaimCard placement="about_mission" className="mb-20" />}

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
              text: ABOUT_VISION_COPY.body,
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

        {claimSlot === 1 && <ResearchClaimCard placement="about_mission" className="mb-20" />}

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

        {claimSlot === 2 && <ResearchClaimCard placement="about_mission" className="mb-20" />}

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
