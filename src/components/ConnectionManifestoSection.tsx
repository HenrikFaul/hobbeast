import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, BookOpenText, HeartHandshake, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import learningFriends from "@/assets/stock/categories/learning.webp";
import volunteeringFriends from "@/assets/stock/categories/volunteering.webp";
import boardGameFriends from "@/assets/stock/categories/board-games.webp";

const values = [
  {
    icon: BookOpenText,
    title: "Tanuljunk egymástól",
    copy: "Legyen kivel kérdezni, gyakorolni és megünnepelni a kis lépéseket.",
  },
  {
    icon: Sprout,
    title: "Fejlődjünk együtt",
    copy: "Haladj a saját tempódban, mások mellett. Nem kell késznek lenned ahhoz, hogy elkezdd.",
  },
  {
    icon: HeartHandshake,
    title: "Legyünk ott egymásnak",
    copy: "Adj segítséget, kérj támogatást — néha egy meghívás vagy egy közös délután is sokat jelent.",
  },
];

const ConnectionManifestoSection = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[#183124] py-20 text-white sm:py-24 lg:py-28">
      <div aria-hidden="true" className="absolute -left-28 -top-36 h-80 w-80 rounded-full border-[44px] border-[#dfff62]/10" />
      <div aria-hidden="true" className="absolute -bottom-48 right-0 h-96 w-96 rounded-full bg-[#c9b7ff]/10 blur-3xl" />

      <div className="container relative mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.22 }}
            transition={{ duration: 0.58 }}
            className="relative mx-auto w-full max-w-2xl pb-12 sm:pb-16"
          >
            <figure className="relative ml-auto aspect-[4/3] w-[88%] overflow-hidden rounded-[2.5rem_1.5rem_3.75rem_2rem] border border-white/15 shadow-2xl">
              <img
                src={learningFriends}
                alt="Barátok közösen olvasnak és beszélgetnek"
                width={720}
                height={480}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#183124]/45 via-transparent to-transparent" />
            </figure>

            <figure className="absolute -bottom-2 left-0 aspect-[4/3] w-[48%] -rotate-3 overflow-hidden rounded-[1.75rem] border-[6px] border-[#183124] shadow-xl">
              <img
                src={volunteeringFriends}
                alt="Önkéntes csapat együtt tesz a környezetéért"
                width={720}
                height={480}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </figure>

            <figure className="absolute -bottom-8 right-3 aspect-square w-[35%] rotate-3 overflow-hidden rounded-full border-[6px] border-[#dfff62] shadow-xl">
              <img
                src={boardGameFriends}
                alt="Barátok együtt örülnek egy társasjáték közben"
                width={720}
                height={480}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </figure>

            <span aria-hidden="true" className="absolute left-6 top-5 -rotate-6 rounded-full border-2 border-[#251b43] bg-[#c9b7ff] px-4 py-2 text-sm font-extrabold text-[#251b43] shadow-xl">
              ☮ kíváncsian · békével
            </span>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.58 }}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#dfff62]">Amiért itt vagyunk</p>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[0.96] tracking-[-0.055em] sm:text-5xl lg:text-[4.2rem]">
              Nyerjük vissza <span className="text-[#dfff62]">egymást.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-white/[0.72] sm:text-lg">
              Nem követőszámokat gyűjtünk. Olyan helyzeteket nyitunk, ahol lehet
              kérdezni, tanulni, segíteni, nevetni — és együtt megélni azt, ami a
              képernyőn kívül történik.
            </p>

            <div className="mt-8 grid gap-3">
              {values.map((value) => (
                <article key={value.title} className="grid grid-cols-[auto_1fr] gap-4 rounded-[1.4rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm sm:p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dfff62] text-[#183124]">
                    <value.icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-extrabold">{value.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/[0.66]">{value.copy}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to="/events?mode=categories" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#dfff62] px-6 text-sm font-extrabold text-[#183124] transition-colors hover:bg-[#e7ff8b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#183124]">
                Találjunk közös ügyet <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <a href="#research" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff62]">
                Mi áll mögötte?
              </a>
            </div>

            <p className="mt-6 max-w-2xl text-xs leading-relaxed text-white/50">
              A Hobbeast találkozási lehetőségeket teremt — a kapcsolatot ti építitek, kölcsönösen és a saját tempótokban.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ConnectionManifestoSection;
