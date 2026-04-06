import { motion } from "framer-motion";
import { Users, MapPin, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-community.jpg";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[80vh] md:min-h-[90vh] flex items-center overflow-hidden gradient-hero">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-accent/5 blur-3xl animate-pulse-soft" style={{ animationDelay: "1.5s" }} />
      </div>

      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Heart size={14} />
              Minden ami élmény
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6">
              Találd meg a{" "}
              <span className="text-gradient">közösségedet</span>
              <br />
              a hobbid által
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-6 md:mb-8 leading-relaxed">
              A Hobbeast összeköt hasonló érdeklődésű embereket. Fedezz fel új hobbikat,
              csatlakozz eseményekhez, és építs valódi barátságokat közös élmények által.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground border-0 shadow-glow gap-2 text-base"
                onClick={() => navigate('/events')}
              >
                Események böngészése
              </Button>
            </div>

            {/* Stats */}
            <div className="flex gap-6 sm:gap-8">
              {[
                { icon: Users, label: "Közösség", value: "10K+" },
                { icon: MapPin, label: "Események", value: "500+" },
                { icon: Heart, label: "Hobbi kategória", value: "80+" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <stat.icon size={20} className="mx-auto mb-1 text-primary" />
                  <div className="text-xl font-bold font-display">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
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
            <div className="rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={heroImg}
                alt="Közösség hobbikkal"
                className="w-full h-[280px] sm:h-[350px] md:h-[400px] lg:h-[500px] object-cover"
              />
            </div>
            {/* Floating card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 left-2 sm:-left-4 glass-strong rounded-xl p-3 sm:p-4 shadow-lg border max-w-[calc(100%-1rem)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                  <Users size={18} className="text-primary-foreground" />
                </div>
                <div>
                  <div className="font-display font-semibold text-sm">Új közösségek várnak</div>
                  <div className="text-xs text-muted-foreground">Találj rád illő programokat</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
