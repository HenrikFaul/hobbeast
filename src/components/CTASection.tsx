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
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl gradient-primary p-8 sm:p-12 md:p-16 lg:p-20 text-center overflow-hidden"
        >
          {/* Background effects */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(24_95%_62%/0.4),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,hsl(16_85%_58%/0.3),transparent_50%)]" />
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent" />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-foreground/15 text-primary-foreground text-sm font-medium mb-6 backdrop-blur-sm"
            >
              <Sparkles size={14} />
              Csatlakozz most
            </motion.div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-primary-foreground mb-5 leading-tight">
              Készen állsz az élményre?
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto text-base sm:text-lg mb-10 leading-relaxed">
              Csatlakozz a Hobbeast közösséghez, és fedezd fel azokat az embereket, akikkel közös a szenvedélyed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-primary-foreground text-foreground hover:bg-primary-foreground/90 gap-2 text-base font-semibold h-12 px-8 rounded-xl shadow-lg"
                onClick={() => navigate('/auth')}
              >
                Ingyenes regisztráció <ArrowRight size={18} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 gap-2 text-base h-12 px-8 rounded-xl"
                onClick={() => navigate('/about')}
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
