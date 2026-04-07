import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import logo from "@/assets/hobbeast-logo.png";

const Footer = () => {
  return (
    <footer className="border-t bg-card">
      {/* Main footer */}
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 mb-10">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <img src={logo} alt="Hobbeast" className="h-9 w-9" />
              <span className="font-display text-lg font-bold text-gradient">Hobbeast</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Minden ami élmény, közösség, barátok, értékek. Közösségi platform hobbi szerelmeseinek.
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-sm">Platform</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <Link to="/explore" className="block hover:text-primary transition-colors">Hobbi felfedezés</Link>
              <Link to="/events" className="block hover:text-primary transition-colors">Események</Link>
              <Link to="/about" className="block hover:text-primary transition-colors">Rólunk</Link>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-sm">Közösség</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <span className="block">Blog</span>
              <span className="block">Segítség</span>
              <span className="block">Kapcsolat</span>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-sm">Jogi</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <span className="block">Adatvédelem</span>
              <span className="block">Felhasználási feltételek</span>
              <span className="block">ÁSZF</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
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
