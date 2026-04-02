import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Compass, Menu, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerMode } from "@/hooks/useOrganizerMode";
import { cn } from "@/lib/utils";
import logo from "@/assets/hobbeast-logo.png";

const navLinks = [
  { to: "/", label: "Főoldal" },
  { to: "/explore", label: "Felfedezés" },
  { to: "/events", label: "Események" },
  { to: "/about", label: "Rólunk" },
];

const isLinkActive = (pathname: string, target: string) => {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
};

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { mode, canUseOrganizerMode } = useOrganizerMode();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <div className="mx-auto max-w-7xl rounded-[1.6rem] border border-border/70 bg-card/80 px-4 shadow-card backdrop-blur-xl sm:px-5">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-border/70">
              <img src={logo} alt="Hobbeast" className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-lg font-bold text-gradient">Hobbeast</span>
                {canUseOrganizerMode && mode === "organizer" && (
                  <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:inline-flex">
                    Organizer
                  </span>
                )}
              </div>
              <p className="hidden text-xs text-muted-foreground md:block">
                közösség • élmény • programok
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1">
              {navLinks.map((link) => {
                const active = isLinkActive(location.pathname, link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
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
                className={cn(
                  "rounded-full px-4",
                  location.pathname.startsWith("/organizer") && "gradient-primary text-primary-foreground border-0",
                )}
                onClick={() => navigate("/organizer")}
              >
                <BriefcaseBusiness className="mr-2 h-4 w-4" />
                Organizer
              </Button>
            )}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {!loading &&
              (user ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate("/explore")}
                  >
                    <Compass className="mr-2 h-4 w-4" />
                    Felfedezés
                  </Button>
                  <NotificationBell />
                  <ProfileMenu />
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/auth")}>
                    Bejelentkezés
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full border-0 gradient-primary px-4 text-primary-foreground shadow-glow"
                    onClick={() => navigate("/auth")}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Csatlakozz
                  </Button>
                </>
              ))}
          </div>

          <button
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-foreground md:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Menü megnyitása"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border/60 py-4 md:hidden">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => {
                const active = isLinkActive(location.pathname, link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                      active ? "bg-foreground text-background" : "bg-background/70 text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {canUseOrganizerMode && user && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-11 rounded-2xl"
                  onClick={() => {
                    navigate("/organizer");
                    setMobileOpen(false);
                  }}
                >
                  <BriefcaseBusiness className="mr-2 h-4 w-4" />
                  Organizer felület
                </Button>
              )}

              <div className="mt-2 flex flex-col gap-2">
                {user ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={() => {
                        navigate("/profile");
                        setMobileOpen(false);
                      }}
                    >
                      Profilom
                    </Button>
                    <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                      <span className="text-sm text-muted-foreground">Értesítések és profil</span>
                      <div className="flex items-center gap-2">
                        <NotificationBell />
                        <ProfileMenu />
                      </div>
                    </div>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="h-11 rounded-2xl border-0 gradient-primary text-primary-foreground"
                    onClick={() => {
                      navigate("/auth");
                      setMobileOpen(false);
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Csatlakozz
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
