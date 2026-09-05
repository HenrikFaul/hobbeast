import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n/I18nProvider";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizerModeProvider } from "@/hooks/useOrganizerMode";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ScrollToTop } from "@/components/ScrollToTop";
import { isNativeRuntime } from "@/integrations/native/isNativeRuntime";
import Index from "./pages/Index";

// The native shell is loaded ONLY on a device. Importing it eagerly pulled the
// whole Capacitor runtime into the shared app shell — 11 604 raw / 4 934 gzip
// bytes that a browser downloads and can never run. `isNativeRuntime()` is
// dependency-free (see that module for why it is the same test Capacitor
// itself performs), so on the web this chunk is never even requested.
const NativeBootstrap = lazy(() =>
  import("@/integrations/native/NativeBootstrap").then((m) => ({ default: m.NativeBootstrap })));
const IS_NATIVE = isNativeRuntime();

// Route-level code splitting (Sprint 1.4). Heavy admin/organizer bundles and
// secondary routes are loaded on demand so the landing page ships a small,
// cache-friendly initial payload.
const Explore = lazy(() => import("./pages/Explore"));
const Events = lazy(() => import("./pages/Events"));
const EventsMap = lazy(() => import("@/pages/EventsMap"));
const Clubs = lazy(() => import("@/pages/Clubs"));
const ClubDetail = lazy(() => import("@/pages/ClubDetail"));
const OrganizationPage = lazy(() => import("@/pages/OrganizationPage"));
const About = lazy(() => import("./pages/About"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const OrganizerDashboard = lazy(() => import("./pages/OrganizerDashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PublicMemberProfile = lazy(() => import("./pages/PublicMemberProfile"));
const Community = lazy(() => import("./pages/Community"));
const Legal = lazy(() => import("./pages/Legal"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// P0 (v1.7.4): back-compat redirect for any stale `/events/:id/organize`
// link (bookmarks, external references). The canonical route is
// `/organizer?event=:id`.
const OrganizeEventRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/organizer?event=${id}` : '/organizer'} replace />;
};

const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"
  >
    Betöltés…
  </div>
);

const App = () => (
  <AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
    <AuthProvider>
      <OrganizerModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {IS_NATIVE && (
              <Suspense fallback={null}>
                <NativeBootstrap />
              </Suspense>
            )}
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={
                  <div className="relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_22%,hsl(18_70%_82%/0.24),transparent_24rem),radial-gradient(circle_at_92%_12%,hsl(92_34%_77%/0.3),transparent_30rem),linear-gradient(180deg,hsl(var(--background)),hsl(42_33%_93%))]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none fixed -right-40 top-[42vh] -z-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl"
                    />
                    <ScrollToTop />
                    <Navbar />
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/explore" element={<Explore />} />
                        <Route path="/events" element={<Events />} />
                        <Route path="/events/map" element={<EventsMap />} />
                        <Route path="/events/:id" element={<EventDetail />} />
                        <Route path="/klubok" element={<Clubs />} />
                        <Route path="/klubok/:slug" element={<ClubDetail />} />
                        <Route path="/szervezet/:slug" element={<OrganizationPage />} />
                        <Route path="/events/:id/organize" element={<OrganizeEventRedirect />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/onboarding" element={<Onboarding />} />
                        <Route path="/members/:userId" element={<PublicMemberProfile />} />
                        {/* Circles and hubs are an operator surface for now: they are
                            empty until there are members to fill them, and an empty
                            community page reads as a broken one. */}
                        <Route path="/community" element={<Navigate to="/admin?tab=community" replace />} />
                        <Route path="/legal" element={<Legal />} />
                        <Route path="/organizer" element={<OrganizerDashboard />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                    <Footer />
                  </div>
                } />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </OrganizerModeProvider>
    </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
