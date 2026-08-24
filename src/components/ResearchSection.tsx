import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, ExternalLink, TrendingUp } from "lucide-react";

const studies = [
  {
    authors: "Baumeister & Leary (1995)",
    title: "The Need to Belong",
    journal: "Psychological Bulletin",
    insight: "A valahová tartozás alapvető emberi szükséglet.",
    url: "https://psycnet.apa.org/record/1995-29052-001",
  },
  {
    authors: "Holt-Lunstad et al. (2010)",
    title: "Social Relationships and Mortality Risk",
    journal: "PLOS Medicine",
    insight: "Az erős társas kapcsolatok szignifikánsan növelik a túlélést.",
    url: "https://journals.plos.org/plosmedicine/article?id=10.1371/journal.pmed.1000316",
  },
  {
    authors: "U.S. Surgeon General (2023)",
    title: "Our Epidemic of Loneliness and Isolation",
    journal: "Advisory Report",
    insight: "A társas kapcsolódás közegészségügyi prioritás.",
    url: "https://www.hhs.gov/sites/default/files/surgeon-general-social-connection-advisory.pdf",
  },
  {
    authors: "Eather et al. (2023)",
    title: "Community Sport Participation Benefits",
    journal: "Systematic Reviews",
    insight: "A közösségi sport javítja a mentális jóllétet és az identitást.",
    url: "https://systematicreviewsjournal.biomedcentral.com/articles/10.1186/s13643-023-02264-8",
  },
  {
    authors: "Cruwys et al. (2014)",
    title: "Social Identity and Depression",
    journal: "Social Science & Medicine",
    insight: "Több csoporthoz tartozás védőfaktor a depresszió ellen.",
    url: "https://www.sciencedirect.com/science/article/pii/S0277953614001087",
  },
  {
    authors: "Pressman et al. (2009)",
    title: "Enjoyable Leisure Activities & Well-Being",
    journal: "Psychosomatic Medicine",
    insight: "Társas szabadidős tevékenységek jobb fizikai és pszichológiai jóllétet hoznak.",
    url: "https://journals.lww.com/psychosomaticmedicine/Fulltext/2009/09000/Association_of_Enjoyable_Leisure_Activities_With.5.aspx",
  },
];

const ResearchSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-background py-20 sm:py-24 lg:py-28">
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
            A közösségi élmények mögött <span className="text-primary">komoly kutatás</span> áll
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A Hobbeast nem csak hangulatra épít. A kapcsolódás, a közös tevékenységek
            és a csoporthoz tartozás pszichológiai hatása erősen alátámasztott.
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
                <span className="text-xs text-primary-foreground/65">Featured research</span>
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
      </div>
    </section>
  );
};

export default ResearchSection;
