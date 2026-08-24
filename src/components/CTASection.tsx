import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-background py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.58 }}
          className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground shadow-[0_34px_90px_-54px_hsl(var(--foreground)/0.75)] sm:rounded-[2.5rem] sm:px-10 sm:py-16 lg:px-16 lg:py-20"
        >
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-primary-foreground/15" />
          <div className="pointer-events-none absolute -right-2 -top-10 h-52 w-52 rounded-full bg-accent/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-background/[0.08] blur-2xl" />
          <div className="pointer-events-none absolute bottom-2 right-6 select-none font-display text-[5.5rem] font-bold leading-none tracking-[-0.06em] text-primary-foreground/[0.035] sm:text-[8rem] lg:text-[11rem]">
            együtt
          </div>

          <div className="relative z-10 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:gap-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/[0.10] px-4 py-2 text-sm font-semibold">
                <Sparkles size={14} aria-hidden="true" />
                Csatlakozz a közösséghez
              </div>

              <h2 className="mt-6 max-w-3xl text-balance font-display text-3xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-4xl lg:text-5xl">
                Készen állsz, hogy új embereket és közös élményeket találj?
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-primary-foreground/75 sm:text-lg">
                Lépj be a Hobbeast világába, ahol a közös hobbi, a programok és
                az új barátságok egyetlen, jól szervezett helyen találkoznak.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button
                size="lg"
                className="h-12 rounded-full bg-background px-7 text-base font-semibold text-foreground shadow-lg hover:bg-background/90 sm:px-8"
                onClick={() => navigate("/auth")}
              >
                Ingyenes regisztráció
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-primary-foreground/30 bg-transparent px-7 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:px-8"
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
