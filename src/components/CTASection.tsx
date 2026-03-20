import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const CTASection = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-2xl gradient-primary p-12 md:p-16 text-center overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(24_95%_62%/0.4),transparent_70%)]" />
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold font-display text-primary-foreground mb-4">
              Készen állsz az élményre?
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto text-lg mb-8">
              Csatlakozz a Hobbeast közösséghez, és fedezd fel azokat az embereket, akikkel közös a szenvedélyed.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 text-base font-semibold"
            >
              Regisztrálj ingyen <ArrowRight size={18} />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
