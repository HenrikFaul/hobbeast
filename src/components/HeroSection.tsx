import { motion } from "framer-motion";
import { Users, Radio, Disc3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-community.jpg";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[82vh] md:min-h-[94vh] flex items-center overflow-hidden gradient-hero scan-line">
      <div className="absolute inset-0 tech-grid opacity-25 pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[-8rem] h-[24rem] w-[24rem] rounded-full bg-accent/12 blur-3xl" />
        <div className="absolute left-1/2 top-24 h-px w-[60vw] -translate-x-1/2 neon-divider opacity-80" />
      </div>

      <div className="container mx-auto px-4 pt-28 pb-16 md:pt-32 md:pb-20 relative">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary mb-8 shadow-glow"
            >
              <Radio size={14} />
              Find your frequency
            </motion.div>

            <h1 className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-bold leading-[1.02] mb-6 max-w-2xl">
              <span className="text-chrome">Kapcsolódj olyan emberekhez,</span>
              <br />
              <span className="text-gradient">akik ugyanarra a hullámhosszra járnak</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl mb-8 md:mb-10 leading-relaxed">
              A Hobbeast itt nem csak eseménylista: ez egy sötét, energikus,
              közösségi vezérlőpult az élményekhez. Fedezz fel új hobbikat,
              csatlakozz eseményekhez, és találj valódi embereket valódi közös ritmussal.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground border-0 gap-2 text-base px-8 h-12 rounded-xl"
                onClick={() => navigate("/events")}
              >
                Indítsd a keresést
                <ArrowRight size={16} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 text-base h-12 px-8 rounded-xl"
                onClick={() => navigate("/about")}
              >
                Mi ez pontosan?
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {[
                { icon: Users, label: "Közösség", value: "10K+" },
                { icon: Disc3, label: "Aktív esemény", value: "500+" },
                { icon: Radio, label: "Hobbi frekvencia", value: "80+" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.08 }}
                  className="chrome-panel rounded-2xl p-4 gradient-border"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <stat.icon size={16} />
                  </div>
                  <div className="text-2xl font-bold font-display leading-none text-chrome">{stat.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="relative"
          >
            <div className="absolute -inset-8 rounded-[2rem] bg-primary/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] gradient-border chrome-panel">
              <img
                src={heroImg}
                alt="Közösség hobbikkal"
                className="w-full h-[300px] sm:h-[380px] md:h-[460px] lg:h-[540px] object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(228_24%_6%/0.08),hsl(228_24%_6%/0.48))]" />
              <div className="absolute inset-x-0 top-0 h-px neon-divider" />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.52 }}
              className="absolute -bottom-5 left-4 sm:left-8 right-4 sm:right-auto max-w-sm rounded-2xl chrome-panel p-4 sm:p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/14 text-accent">
                  <Disc3 size={20} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Live community signal</div>
                  <div className="font-display text-base sm:text-lg font-semibold text-chrome">
                    Valódi emberek. Valódi programok. Nulla zaj.
                  </div>
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
