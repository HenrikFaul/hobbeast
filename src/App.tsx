import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OrganizerModeProvider } from "@/hooks/useOrganizerMode";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import Index from "./pages/Index";

// Route-level code splitting (Sprint 1.4). Heavy admin/organizer bundles and
// secondary routes are loaded on demand so the landing page ships a small,
// cache-friendly initial payload.
const Explore = lazy(() => import("./pages/Explore"));
const Events = lazy(() => import("./pages/Events"));
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
    <AuthProvider>
      <OrganizerModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={
                  <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
                    <div className="pointer-events-none fixed inset-0 tech-grid opacity-[0.06]" />
                    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,hsl(188_100%_58%/0.06),transparent_24%),radial-gradient(circle_at_bottom_right,hsl(272_100%_73%/0.05),transparent_28%)]" />
                    <Navbar />
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/explore" element={<Explore />} />
                        <Route path="/events" element={<Events />} />
                        <Route path="/events/:id" element={<EventDetail />} />
                        <Route path="/events/:id/organize" element={<OrganizeEventRedirect />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/onboarding" element={<Onboarding />} />
                        <Route path="/members/:userId" element={<PublicMemberProfile />} />
                        <Route path="/community" element={<Community />} />
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
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
