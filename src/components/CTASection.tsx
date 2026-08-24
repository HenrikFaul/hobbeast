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
          className="relative isolate overflow-hidden rounded-[2rem] bg-[#ff8f72] px-6 py-12 text-[#2f1711] shadow-[0_34px_90px_-54px_hsl(var(--foreground)/0.75)] sm:rounded-[2.5rem] sm:px-10 sm:py-16 lg:px-16 lg:py-20"
        >
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border-[42px] border-[#2f1711]/[0.08]" />
          <div className="pointer-events-none absolute -right-2 -top-10 h-52 w-52 rounded-full bg-[#dfff62]/60 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#c9b7ff]/55 blur-2xl" />
          <div className="pointer-events-none absolute bottom-2 right-6 select-none font-display text-[5.5rem] font-extrabold leading-none tracking-[-0.07em] text-[#2f1711]/[0.045] sm:text-[8rem] lg:text-[11rem]">
            együtt
          </div>

          <div className="relative z-10 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:gap-16">
            <div>
              <div className="inline-flex rotate-[-1deg] items-center gap-2 rounded-full border border-[#2f1711]/10 bg-[#fffdf7]/55 px-4 py-2 text-sm font-extrabold">
                <Sparkles size={14} aria-hidden="true" />
                Csatlakozz a közösséghez
              </div>

              <h2 className="mt-6 max-w-3xl text-balance font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                Készen állsz, hogy új embereket és közös élményeket találj?
              </h2>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-[#2f1711]/[0.84] sm:text-lg">
                Lépj be a Hobbeast világába, ahol a közös hobbi, a programok és
                az új barátságok egyetlen, jól szervezett helyen találkoznak.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button
                size="lg"
                className="h-12 rounded-full border-[#183124] bg-[#183124] px-7 text-base font-bold text-white shadow-lg hover:bg-[#214c35] sm:px-8"
                onClick={() => navigate("/auth")}
              >
                Ingyenes regisztráció
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-[#2f1711]/20 bg-[#fffdf7]/35 px-7 text-base font-semibold text-[#2f1711] hover:bg-[#fffdf7]/60 hover:text-[#2f1711] sm:px-8"
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
