import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, ExternalLink, TrendingUp } from "lucide-react";

const studies = [
  {
    authors: "World Health Organization (2025)",
    title: "Social connection — questions and answers",
    journal: "WHO",
    insight: "A kapcsolódás nem puszta darabszám: a kölcsönös támogatás és az együttlétek minősége is része.",
    url: "https://www.who.int/news-room/questions-and-answers/item/social-connection",
  },
  {
    authors: "Harvard Study of Adult Development",
    title: "What Makes a Good Life?",
    journal: "Harvard Medicine",
    insight: "A kutatás szerint a kapcsolatok minősége fontos összefüggést mutat a későbbi testi és lelki jólléttel.",
    url: "https://magazine.hms.harvard.edu/articles/good-life",
  },
  {
    authors: "Holt-Lunstad et al. (2010)",
    title: "Social Relationships and Mortality Risk",
    journal: "PLOS Medicine",
    insight: "A 148 vizsgálatot összesítő elemzés erős kapcsolatot talált a társas kapcsolatok és az egészségi kimenetek között.",
    url: "https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.1000316",
  },
  {
    authors: "Baumeister & Leary (1995)",
    title: "The Need to Belong",
    journal: "Psychological Bulletin",
    insight: "A valahová tartozás tartós és széles körű emberi motivációként jelenik meg.",
    url: "https://psycnet.apa.org/record/1995-29052-001",
  },
  {
    authors: "Eather et al. (2023)",
    title: "Community Sport Participation Benefits",
    journal: "Systematic Reviews",
    insight: "A közösségi sporttal kapcsolatos kutatások társas és jólléti előnyöket is jeleznek.",
    url: "https://systematicreviewsjournal.biomedcentral.com/articles/10.1186/s13643-023-02264-8",
  },
  {
    authors: "Pressman et al. (2009)",
    title: "Enjoyable Leisure Activities & Well-Being",
    journal: "Psychosomatic Medicine",
    insight: "Az élvezetes szabadidős tevékenységek több jólléti mutatóval is összefüggést mutattak.",
    url: "https://journals.lww.com/psychosomaticmedicine/Fulltext/2009/09000/Association_of_Enjoyable_Leisure_Activities_With.5.aspx",
  },
];

const ResearchSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section id="research" className="relative scroll-mt-24 overflow-hidden bg-background py-20 sm:py-24 lg:py-28">
      <div className="pointer-events-none absolute -left-36 bottom-10 h-96 w-96 rounded-full bg-primary/[0.08] blur-3xl" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55 }}
          className="mx-auto mb-12 max-w-3xl text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <BookOpen size={14} aria-hidden="true" />
            Kutatásokkal alátámasztva
          </div>
          <h2 className="mt-5 text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl lg:text-5xl">
            A jó élet egyik fontos része: <span className="text-primary">kapcsolódni</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A kutatások nem ígérnek instant boldogságot. Azt viszont következetesen
            jelzik, hogy a kapcsolatok minősége, a kölcsönös támogatás és a valahová
            tartozás érzése összefügg a jólléttel.
          </p>
        </motion.div>

        <motion.a
          href={studies[0].url}
          target="_blank"
          rel="noopener noreferrer"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5 }}
          className="group relative mb-5 block overflow-hidden rounded-[2rem] bg-primary p-6 text-primary-foreground shadow-[0_28px_70px_-48px_hsl(var(--foreground)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-9 lg:p-11"
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary-foreground/15" />
          <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-2xl" />
          <div className="relative grid gap-7 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/15 text-primary-foreground">
              <TrendingUp size={24} aria-hidden="true" />
            </div>
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                  {studies[0].journal}
                </span>
                <span className="text-xs text-primary-foreground/65">Kiemelt forrás</span>
              </div>
              <h3 className="font-display text-xl font-bold tracking-[-0.015em] sm:text-2xl">
                {studies[0].authors}
              </h3>
              <p className="mt-1 text-sm italic text-primary-foreground/70">{studies[0].title}</p>
              <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed sm:text-lg">
                {studies[0].insight}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/25 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1">
              <ExternalLink size={17} aria-hidden="true" />
            </div>
          </div>
        </motion.a>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studies.slice(1).map((study, index) => (
            <motion.a
              key={study.title}
              href={study.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={reduceMotion ? undefined : { y: -4 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.42, delay: index * 0.045 }}
              className={`group flex min-h-[230px] flex-col rounded-[1.6rem] border border-border/75 bg-card p-6 shadow-[0_18px_50px_-40px_hsl(var(--foreground)/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${index === 4 ? "sm:col-span-2 lg:col-span-1" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  {study.journal}
                </span>
                <ExternalLink
                  size={15}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                />
              </div>
              <div className="mt-auto pt-9">
                <div className="mb-3 h-px w-10 bg-accent/60 transition-all duration-300 group-hover:w-16" />
                <h3 className="font-display text-base font-semibold text-foreground">{study.authors}</h3>
                <p className="mt-1 text-xs italic text-muted-foreground">{study.title}</p>
                <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">{study.insight}</p>
              </div>
            </motion.a>
          ))}
        </div>

        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.45 }}
          className="mt-5 grid gap-5 rounded-[1.75rem] border border-border/75 bg-[#f1eee5] p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-8"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5d46f] text-[#33250a]">
            <BookOpen size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Inspiráció, nem bizonyíték</p>
            <h3 className="mt-1 font-display text-xl font-extrabold">David JP Phillips: Betépve az élettől</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Közérthető önsegítő olvasmány az öröm és a mindennapi szokások témájáról.
              A Hobbeast állításait nem a könyv ígéreteire, hanem az eredeti kutatási forrásokra alapozzuk.
            </p>
          </div>
          <a
            href="https://www.animuscentral.hu/betepve-az-elettol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-foreground/15 px-5 text-sm font-bold text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Könyv adatlapja <ExternalLink size={15} aria-hidden="true" />
          </a>
        </motion.aside>
      </div>
    </section>
  );
};

export default ResearchSection;
