import { Link } from "react-router-dom";
import { Heart, MapPin } from "lucide-react";
import { HobbeastMark } from "@/components/HobbeastMark";

const Footer = () => {
  return (
    <footer className="relative mt-8 overflow-hidden rounded-t-[2.5rem] bg-[#183124] text-white sm:mt-12 sm:rounded-t-[3.5rem]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#ff8f72]/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-[18%] h-80 w-80 rounded-full bg-[#dfff62]/10 blur-3xl" />

      <div className="container relative mx-auto py-14 sm:py-20">
        <div className="mb-12 grid grid-cols-2 gap-9 sm:gap-12 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="mb-5 inline-flex items-center gap-3 rounded-2xl">
              <span className="rounded-2xl bg-primary-foreground p-1 shadow-soft">
                <HobbeastMark className="h-10 w-10" />
              </span>
              <span className="font-display text-2xl font-extrabold tracking-[-0.055em]">Hobbeast</span>
            </Link>
            <p className="max-w-sm text-sm leading-7 text-white/[0.68] sm:text-base">
              Hobbik, közös élmények és valódi kapcsolódások — közelebb, mint gondolnád.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/[0.85]">
              <MapPin size={14} aria-hidden="true" />
              Budapest &amp; Wien
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-bold text-primary-foreground">Felfedezés</h4>
            <div className="space-y-3.5 text-sm text-primary-foreground/[0.68]">
              <Link to="/explore" className="block transition-colors hover:text-primary-foreground">Hobbi felfedezés</Link>
              <Link to="/events" className="block transition-colors hover:text-primary-foreground">Események</Link>
              <Link to="/about" className="block transition-colors hover:text-primary-foreground">Rólunk</Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-bold text-primary-foreground">Közösség</h4>
            <div className="space-y-3.5 text-sm text-primary-foreground/[0.68]">
              <Link to="/community" className="block transition-colors hover:text-primary-foreground">Közösségi tér</Link>
              <a href="mailto:hello@henrislabs.hu" className="block transition-colors hover:text-primary-foreground">Segítség</a>
              <a href="mailto:hello@henrislabs.hu" className="block transition-colors hover:text-primary-foreground">Kapcsolat</a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-bold text-primary-foreground">Jogi</h4>
            <div className="space-y-3.5 text-sm text-primary-foreground/[0.68]">
              <Link to="/legal#adatkezeles" className="block transition-colors hover:text-primary-foreground">Adatvédelem</Link>
              <Link to="/legal#feltetelek" className="block transition-colors hover:text-primary-foreground">Felhasználási feltételek</Link>
              <Link to="/legal#impresszum" className="block transition-colors hover:text-primary-foreground">Impresszum</Link>
            </div>
          </div>
        </div>

        <div className="mb-7 h-px bg-primary-foreground/[0.14]" />

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-primary-foreground/[0.62] sm:flex-row">
          <span>© 2026 Expericentre · Hobbeast. Minden jog fenntartva.</span>
          <span className="flex items-center gap-1.5">
            Közösségre hangolva <Heart size={13} className="fill-accent text-accent" aria-hidden="true" />
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
