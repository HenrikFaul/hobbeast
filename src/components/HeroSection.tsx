import { motion } from "framer-motion";
import { Users, MapPin, Heart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-community.jpg";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[80vh] md:min-h-[90vh] flex items-center overflow-hidden gradient-hero">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-accent/5 blur-3xl animate-pulse-soft" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/[0.02] blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background/30" />
      </div>

      <div className="container mx-auto px-4 pt-28 pb-16 md:pt-32 md:pb-20">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 shadow-soft"
            >
              <Heart size={14} className="animate-pulse" />
              Lágy pulzus, valódi kapcsolódások
            </motion.div>

            <h1 className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6">
              Találd meg a{" "}
              <span className="text-gradient">közösségedet</span>
              <br />
              a hobbid által
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-8 md:mb-10 leading-relaxed">
              A Hobbeast összeköt hasonló érdeklődésű embereket. Fedezz fel új hobbikat,
              csatlakozz eseményekhez, és építs valódi barátságokat közös élményekkel — egy kicsit filmszerűbb hangulatban.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground border-0 shadow-glow gap-2 text-base px-8 h-12"
                onClick={() => navigate('/events')}
              >
                Események böngészése
                <ArrowRight size={16} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 text-base h-12 px-8 border-border/60 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate('/about')}
              >
                Tudj meg többet
              </Button>
            </div>

            <div className="mb-10 flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 shadow-soft">Esti afterglow</span>
              <span className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 shadow-soft">Közeli emberek</span>
              <span className="rounded-full border border-border/60 bg-card/80 px-3 py-1.5 shadow-soft">Közös mozdulás</span>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-3 sm:gap-4">
              {[
                { icon: Users, label: "Közösség", value: "10K+" },
                { icon: MapPin, label: "Események", value: "500+" },
                { icon: Heart, label: "Hobbi kategória", value: "80+" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card shadow-soft border border-border/50"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <stat.icon size={16} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-lg font-bold font-display leading-none">{stat.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="rounded-2xl overflow-hidden shadow-2xl gradient-border">
              <img
                src={heroImg}
                alt="Közösség hobbikkal"
                className="w-full h-[280px] sm:h-[350px] md:h-[420px] lg:h-[520px] object-cover"
              />
              {/* Image overlay */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-foreground/15 via-transparent to-primary/5 pointer-events-none" />
            </div>
            {/* Floating card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 left-2 sm:-left-4 glass-strong rounded-2xl p-4 shadow-lg border border-border/50 max-w-[calc(100%-1rem)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                  <Users size={18} className="text-primary-foreground" />
                </div>
                <div>
                  <div className="font-display font-semibold text-sm">Új közösségek várnak</div>
                  <div className="text-xs text-muted-foreground">Találj rád illő programokat</div>
                </div>
              </div>
            </motion.div>

            {/* Top-right decorative badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
              className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl gradient-accent flex items-center justify-center shadow-lg"
            >
              <div className="text-center text-accent-foreground">
                <div className="text-lg sm:text-xl font-bold font-display leading-none">80+</div>
                <div className="text-[9px] sm:text-[10px] opacity-80 leading-tight mt-0.5">hobbi</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
