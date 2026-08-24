import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HobbeastMark } from "@/components/HobbeastMark";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerMode } from "@/hooks/useOrganizerMode";

const navLinks = [
  { to: "/", label: "Főoldal" },
  { to: "/events", label: "Események" },
  { to: "/community", label: "Közösség" },
  { to: "/about", label: "Rólunk" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { mode, canUseOrganizerMode } = useOrganizerMode();

  const isCurrentRoute = (path: string) =>
    path === "/" ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5" aria-label="Fő navigáció">
      <div className="glass-strong relative mx-auto flex h-[4.5rem] max-w-[86rem] items-center justify-between rounded-[1.4rem] px-3 sm:px-5">
        <Link
          to="/"
          className="group flex min-h-11 items-center gap-2.5 rounded-2xl pr-2"
          aria-label="Hobbeast főoldal"
        >
          <HobbeastMark className="h-10 w-10 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-[1.04]" />
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-extrabold tracking-[-0.045em] text-foreground sm:text-[1.35rem]">
              Hobbeast
            </span>
            {canUseOrganizerMode && mode === "organizer" && (
              <span className="hidden rounded-full border border-primary/15 bg-secondary px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary sm:inline-flex">
                Organizer
              </span>
            )}
          </div>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <div className="mr-1 flex items-center gap-0.5 rounded-full bg-background/55 p-1">
            {navLinks.map((link) => {
              const isActive = isCurrentRoute(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-200 ${
                    isActive
                      ? "bg-card text-primary shadow-soft"
                      : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {canUseOrganizerMode && user && (
            <Button
              variant={location.pathname.startsWith("/organizer") ? "default" : "outline"}
              size="sm"
              onClick={() => navigate("/organizer")}
            >
              <BriefcaseBusiness className="mr-1 h-4 w-4" /> Organizer
            </Button>
          )}

          {!loading &&
            (user ? (
              <div className="ml-1 flex items-center gap-2">
                <NotificationBell />
                <ProfileMenu />
              </div>
            ) : (
              <Button size="sm" className="ml-1" onClick={() => navigate("/auth")}>
                Csatlakozz
              </Button>
            ))}
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Menü bezárása" : "Menü megnyitása"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground transition-colors hover:bg-secondary lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="mobile-nav"
          className="glass-strong mx-auto mt-2 max-w-[86rem] rounded-[1.6rem] p-3 shadow-modal lg:hidden"
        >
          <div className="grid gap-1">
            {navLinks.map((link) => {
              const isActive = isCurrentRoute(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold transition-colors ${
                    isActive ? "bg-secondary text-primary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {canUseOrganizerMode && user && (
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => {
                navigate("/organizer");
                setMobileOpen(false);
              }}
            >
              <BriefcaseBusiness className="mr-1 h-4 w-4" /> Organizer felület
            </Button>
          )}

          <div className="mt-2 border-t border-border/70 pt-3">
            {user ? (
              <div className="flex items-center gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => {
                    navigate("/profile");
                    setMobileOpen(false);
                  }}
                >
                  Profilom
                </Button>
                <ProfileMenu />
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => {
                  navigate("/auth");
                  setMobileOpen(false);
                }}
              >
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
