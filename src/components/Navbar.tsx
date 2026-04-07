import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerMode } from "@/hooks/useOrganizerMode";
import logo from "@/assets/hobbeast-logo.png";

const navLinks = [
  { to: "/", label: "Főoldal" },
  { to: "/events", label: "Események" },
  { to: "/about", label: "Rólunk" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { mode, canUseOrganizerMode } = useOrganizerMode();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="Hobbeast" className="h-9 w-9" />
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-gradient">Hobbeast</span>
            {canUseOrganizerMode && mode === 'organizer' && (
              <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Organizer
              </span>
            )}
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                  isActive
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}

          <div className="w-px h-6 bg-border mx-2" />

          {canUseOrganizerMode && user && (
            <Button
              variant={location.pathname.startsWith('/organizer') ? 'default' : 'outline'}
              size="sm"
              className="rounded-xl"
              onClick={() => navigate('/organizer')}
            >
              <BriefcaseBusiness className="mr-2 h-4 w-4" /> Organizer
            </Button>
          )}
          {!loading && (
            user ? (
              <div className="flex items-center gap-2 ml-1">
                <NotificationBell />
                <ProfileMenu />
              </div>
            ) : (
              <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow rounded-xl ml-1" onClick={() => navigate('/auth')}>
                Csatlakozz
              </Button>
            )
          )}
        </div>

        <button className="md:hidden p-2 text-foreground rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden glass-strong border-t border-border/50 pb-4">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-6 py-3 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === link.to ? "text-primary bg-primary/5" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {canUseOrganizerMode && user && (
            <Button
              size="sm"
              variant="outline"
              className="mx-6 mt-2 w-[calc(100%-3rem)] rounded-xl"
              onClick={() => { navigate('/organizer'); setMobileOpen(false); }}
            >
              <BriefcaseBusiness className="mr-2 h-4 w-4" /> Organizer felület
            </Button>
          )}
          <div className="px-6 pt-2">
            {user ? (
              <div className="flex items-center gap-2">
                <Button size="sm" className="flex-1" variant="outline" onClick={() => { navigate('/profile'); setMobileOpen(false); }}>
                  Profilom
                </Button>
                <ProfileMenu />
              </div>
            ) : (
              <Button size="sm" className="w-full gradient-primary text-primary-foreground border-0 rounded-xl" onClick={() => { navigate('/auth'); setMobileOpen(false); }}>
                Csatlakozz
              </Button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
