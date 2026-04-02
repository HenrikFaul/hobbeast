import { Link } from "react-router-dom";
import { Heart, MapPin, Sparkles } from "lucide-react";
import logo from "@/assets/hobbeast-logo.png";

const footerLinks = {
  Platform: [
    { label: "Főoldal", to: "/" },
    { label: "Felfedezés", to: "/explore" },
    { label: "Események", to: "/events" },
    { label: "Rólunk", to: "/about" },
  ],
  Közösség: [
    { label: "Profil", to: "/profile" },
    { label: "Organizer mód", to: "/organizer" },
    { label: "Admin", to: "/admin" },
  ],
};

const Footer = () => {
  return (
    <footer className="px-4 pb-8 pt-4">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-card backdrop-blur">
        <div className="grid gap-8 px-6 py-10 md:grid-cols-[1.2fr_0.8fr_0.8fr] md:px-8 lg:px-10">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border/70">
                <img src={logo} alt="Hobbeast" className="h-9 w-9" />
              </div>
              <div>
                <span className="font-display text-2xl font-bold text-gradient">Hobbeast</span>
                <p className="text-sm text-muted-foreground">minden ami élmény</p>
              </div>
            </Link>
            <p className="max-w-md text-sm leading-7 text-muted-foreground">
              Olyan közösségi tér, ahol a hobbi, az élmény és az emberek egymásra találnak.
              Fedezz fel programokat, szervezz eseményeket, és találj új társakat a kedvenc tevékenységeidhez.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="hero-chip">közösség</span>
              <span className="hero-chip">élmény</span>
              <span className="hero-chip">események</span>
            </div>
          </div>

          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group}
              </h4>
              <div className="space-y-3">
                {links.map((link) => (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="block text-sm text-foreground/80 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8 lg:px-10">
          <span>© 2026 Hobbeast. Minden jog fenntartva.</span>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} className="text-primary" />
              Budapest & Wien
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-primary" />
              közösségi élmények
            </span>
            <span className="inline-flex items-center gap-1.5">
              Made with <Heart size={12} className="text-primary" /> for hobby lovers
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
