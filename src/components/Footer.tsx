import { Link } from "react-router-dom";
import { Heart, Radio } from "lucide-react";
import logo from "@/assets/hobbeast-logo.png";

const Footer = () => {
  return (
    <footer className="border-t border-border/70 bg-card/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="mb-10 grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="mb-4 flex items-center gap-3">
              <img src={logo} alt="Hobbeast" className="h-9 w-9 rounded-xl ring-1 ring-primary/20" />
              <span className="font-display text-lg font-bold text-chrome">Hobbeast</span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Karakteres közösségi platform hobbikhoz, eseményekhez és valódi kapcsolódásokhoz.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-primary">
              <Radio size={12} />
              Community signal active
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-semibold text-chrome">Platform</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <Link to="/explore" className="block transition-colors hover:text-primary">Hobbi felfedezés</Link>
              <Link to="/events" className="block transition-colors hover:text-primary">Események</Link>
              <Link to="/about" className="block transition-colors hover:text-primary">Rólunk</Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-semibold text-chrome">Közösség</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <span className="block">Blog</span>
              <span className="block">Segítség</span>
              <span className="block">Kapcsolat</span>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-display text-sm font-semibold text-chrome">Jogi</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <span className="block">Adatvédelem</span>
              <span className="block">Felhasználási feltételek</span>
              <span className="block">ÁSZF</span>
            </div>
          </div>
        </div>

        <div className="neon-divider mb-8 opacity-50" />

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <span>© 2026 Hobbeast. Minden jog fenntartva.</span>
          <span className="flex items-center gap-1.5">
            Made with <Heart size={12} className="text-primary" /> in Budapest & Wien
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
