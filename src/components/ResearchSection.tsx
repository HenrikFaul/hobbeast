import { motion } from "framer-motion";
import { BookOpen, ExternalLink, TrendingUp } from "lucide-react";

const studies = [
  {
    authors: "Baumeister & Leary (1995)",
    title: "The Need to Belong",
    journal: "Psychological Bulletin",
    insight: "A valahová tartozás alapvető emberi szükséglet.",
    url: "https://psycnet.apa.org/record/1995-29052-001",
    featured: true,
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
  return (
    <section className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 gradient-warm pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium mb-4 tracking-wide uppercase">
            <BookOpen size={14} />
            Tudományosan megalapozva
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-display mb-4">
            Kutatások bizonyítják
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
            A Hobbeast ötlete nem véletlen – a közösséghez tartozás igényét évtizedek kutatásai támasztják alá.
          </p>
        </motion.div>

        {/* Featured study */}
        <motion.a
          href={studies[0].url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="group block card-premium p-6 sm:p-8 mb-8 gradient-border"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={24} className="text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">{studies[0].journal}</span>
                <span className="text-xs text-muted-foreground">• Kiemelt kutatás</span>
              </div>
              <h3 className="font-display font-bold text-lg mb-1">{studies[0].authors}</h3>
              <p className="text-sm text-muted-foreground italic mb-2">{studies[0].title}</p>
              <p className="text-base text-foreground font-medium">{studies[0].insight}</p>
            </div>
            <ExternalLink size={18} className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 hidden sm:block" />
          </div>
        </motion.a>

        {/* Rest of studies */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {studies.slice(1).map((study, i) => (
            <motion.a
              key={study.title}
              href={study.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group card-premium p-5 sm:p-6"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">{study.journal}</span>
                <ExternalLink size={14} className="text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
              </div>
              <h3 className="font-display font-semibold text-sm mb-1">{study.authors}</h3>
              <p className="text-xs text-muted-foreground mb-3 italic">{study.title}</p>
              <p className="text-sm text-foreground font-medium leading-relaxed">{study.insight}</p>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ResearchSection;
