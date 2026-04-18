import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();

  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-[2rem] p-8 sm:p-12 md:p-16 lg:p-20 text-center chrome-panel gradient-border"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(188_100%_58%/0.16),transparent_32%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,hsl(272_100%_73%/0.14),transparent_30%)]" />
          <div className="absolute inset-0 tech-grid opacity-15" />
          <div className="absolute inset-x-0 top-0 neon-divider" />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
            >
              <Sparkles size={14} />
              Csatlakozz a közösséghez
            </motion.div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-5 leading-tight max-w-3xl mx-auto">
              Készen állsz, hogy <span className="text-gradient">új embereket és közös élményeket</span> találj?
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground">
              Lépj be a Hobbeast világába, ahol a közös hobbi, a programok és
              az új barátságok egyetlen, jól szervezett helyen találkoznak.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground gap-2 text-base font-semibold h-12 px-8 rounded-xl"
                onClick={() => navigate("/auth")}
              >
                Ingyenes regisztráció <ArrowRight size={18} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 text-base h-12 px-8 rounded-xl"
                onClick={() => navigate("/about")}
              >
                Tudj meg többet
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
