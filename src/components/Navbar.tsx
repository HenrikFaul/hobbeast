import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseBusiness, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HobbeastMark } from "@/components/HobbeastMark";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerMode } from "@/hooks/useOrganizerMode";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const navLinks = [
  { to: "/", labelKey: "nav.home" },
  { to: "/events", labelKey: "nav.events" },
  { to: "/explore", labelKey: "nav.hobbies" },
  { to: "/klubok", labelKey: "nav.clubs" },
  { to: "/about", labelKey: "nav.about" },
];

const Navbar = () => {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { mode, canUseOrganizerMode } = useOrganizerMode();

  const isCurrentRoute = (path: string) =>
    path === "/" ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4" aria-label="Fő navigáció">
      <div className="relative mx-auto flex h-[4.5rem] max-w-[90rem] items-center justify-between rounded-[1.45rem] border border-white/80 bg-[#fffdf7]/[0.92] px-3 shadow-[0_18px_55px_-28px_rgba(20,45,31,0.46)] backdrop-blur-xl sm:px-5">
        <Link
          to="/"
          className="group flex min-h-11 items-center gap-2.5 rounded-2xl pr-2"
          aria-label="Hobbeast főoldal"
        >
          <HobbeastMark className="h-10 w-10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-[1.06]" />
          <div className="flex items-center gap-2.5">
            <span className="font-display text-xl font-extrabold tracking-[-0.055em] text-foreground sm:text-[1.4rem]">Hobbeast</span>
            <span className="hidden h-6 w-px bg-border xl:block" aria-hidden="true" />
            <span className="hidden text-[0.64rem] font-bold uppercase leading-tight tracking-[0.13em] text-muted-foreground xl:block">
              Találd meg<br />a közösséged
            </span>
            {canUseOrganizerMode && mode === "organizer" && (
              <span className="hidden rounded-full border border-primary/15 bg-secondary px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary sm:inline-flex">
                Organizer
              </span>
            )}
          </div>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <div className="mr-1 flex items-center gap-0.5 rounded-full bg-[#edf0e7] p-1">
            {navLinks.map((link) => {
              const isActive = isCurrentRoute(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-200 ${
                    isActive
                      ? "bg-[#183124] text-white shadow-soft"
                      : "text-muted-foreground hover:bg-white/80 hover:text-foreground"
                  }`}
                >
                  {t(link.labelKey)}
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

          {/* The language control sits before the account actions: someone who
              cannot read the page needs it before anything else. */}
          <LanguageSwitcher className="ml-1 hidden sm:inline-flex" />

          {!loading &&
            (user ? (
              <div className="ml-1 flex items-center gap-2">
                <NotificationBell />
                <ProfileMenu />
              </div>
            ) : (
              <Button size="sm" className="ml-1 rounded-full border-[#dfff62] bg-[#dfff62] px-5 text-[#183124] shadow-none hover:bg-[#e7ff8b]" onClick={() => navigate("/auth")}>
                {t('nav.join')}
              </Button>
            ))}
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Menü bezárása" : "Menü megnyitása"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-foreground/10 bg-[#edf0e7] text-foreground transition-colors hover:bg-[#dfff62] lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="mobile-nav"
          className="mx-auto mt-2 max-w-[90rem] rounded-[1.6rem] border border-white/80 bg-[#fffdf7]/95 p-3 shadow-modal backdrop-blur-xl lg:hidden"
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
                    isActive ? "bg-[#183124] text-white" : "text-foreground hover:bg-[#edf0e7]"
                  }`}
                >
                  {t(link.labelKey)}
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
