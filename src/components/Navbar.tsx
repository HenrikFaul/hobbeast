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
    <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
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

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === link.to ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
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
              <div className="flex items-center gap-2">
                <NotificationBell />
                <ProfileMenu />
              </div>
            ) : (
              <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => navigate('/auth')}>
                Csatlakozz
              </Button>
            )
          )}
        </div>

        <button className="md:hidden p-2 text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden glass-strong border-t pb-4">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-6 py-3 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === link.to ? "text-primary" : "text-muted-foreground"
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
              <Button size="sm" className="w-full gradient-primary text-primary-foreground border-0" onClick={() => { navigate('/auth'); setMobileOpen(false); }}>
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
