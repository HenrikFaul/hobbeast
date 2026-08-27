import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Shield, ShieldAlert, BookOpen, Users, Calendar, BarChart3, Flag, RefreshCw, Settings, Store, ClipboardPaste } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
// Only one admin tab is ever on screen, and several panels carry their own
// charts, editors and inspectors — so every panel loads when its tab is opened
// instead of shipping the whole console in one chunk.
const AdminScraper = lazy(() => import("@/components/admin/AdminScraper").then((m) => ({ default: m.AdminScraper })));
const AdminCatalog = lazy(() => import("@/components/admin/AdminCatalog").then((m) => ({ default: m.AdminCatalog })));
const AdminUsers = lazy(() => import("@/components/admin/AdminUsers").then((m) => ({ default: m.AdminUsers })));
const AdminAutoEvents = lazy(() => import("@/components/admin/AdminAutoEvents").then((m) => ({ default: m.AdminAutoEvents })));
const AdminEvents = lazy(() => import("@/components/admin/AdminEvents").then((m) => ({ default: m.AdminEvents })));
const AdminMetrics = lazy(() => import("@/components/admin/AdminMetrics").then((m) => ({ default: m.AdminMetrics })));
const AdminEventbrite = lazy(() => import("@/components/admin/AdminEventbrite").then((m) => ({ default: m.AdminEventbrite })));
const CommonAdminPanel = lazy(() => import("@/components/admin/CommonAdminPanel").then((m) => ({ default: m.CommonAdminPanel })));
const AdminModeration = lazy(() => import("@/components/admin/AdminModeration").then((m) => ({ default: m.AdminModeration })));
const AdminProductOutcomes = lazy(() => import("@/components/admin/AdminProductOutcomes").then((m) => ({ default: m.AdminProductOutcomes })));
const AdminFeatureFlags = lazy(() => import("@/components/admin/AdminFeatureFlags").then((m) => ({ default: m.AdminFeatureFlags })));
const AdminOperations = lazy(() => import("@/components/admin/AdminOperations").then((m) => ({ default: m.AdminOperations })));
const AdminPartnerPerformance = lazy(() => import("@/components/admin/AdminPartnerPerformance").then((m) => ({ default: m.AdminPartnerPerformance })));
const AdminClubs = lazy(() => import("@/components/admin/AdminClubs").then((m) => ({ default: m.AdminClubs })));
const AdminClubRefresh = lazy(() => import("@/components/admin/AdminClubRefresh").then((m) => ({ default: m.AdminClubRefresh })));
const AdminPostImport = lazy(() => import("@/components/admin/AdminPostImport").then((m) => ({ default: m.AdminPostImport })));
// Circles and hubs live here until there are members to fill them.
const Community = lazy(() => import("@/pages/Community"));

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedTabs = ['catalog', 'users', 'auto-events', 'events', 'operations', 'moderation', 'metrics', 'outcomes', 'feature-flags', 'eventbrite', 'common-admin', 'scraper', 'partners', 'clubs', 'club-refresh', 'post-import', 'community'] as const;
  const searchTab = searchParams.get('tab');
  const activeTab = allowedTabs.includes(searchTab as (typeof allowedTabs)[number]) ? searchTab : 'catalog';
  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user) {
      // Come back to the tab they were headed for — an extension hand-off
      // is waiting in session storage and belongs on that tab.
      navigate('/auth?redirect=' + encodeURIComponent('/admin' + window.location.search));
      return;
    }
    if (!isAdmin) {
      console.warn('[Admin] redirect to / — user has no admin role', { userId: user.id });
      navigate('/');
    }
  }, [authLoading, adminLoading, user, isAdmin, navigate]);
  if (authLoading || adminLoading) return <main className="pt-24 pb-16 min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></main>;
  if (!isAdmin) return null;
  return (
    <main className="pt-24 pb-16 min-h-screen"><div className="container mx-auto px-4"><div className="flex items-center gap-3 mb-8"><Shield className="h-7 w-7 text-primary" /><h1 className="text-2xl sm:text-3xl font-bold font-display">Admin felület</h1></div>
      <Tabs
        value={activeTab}
        onValueChange={(nextTab) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', nextTab);
            return next;
          }, { replace: true });
        }}
        className="w-full"
      ><TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-17"><TabsTrigger value="catalog" className="text-xs sm:text-sm"><BookOpen className="h-4 w-4 mr-1 hidden sm:inline" /> Katalógus</TabsTrigger><TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Felhasználók</TabsTrigger><TabsTrigger value="auto-events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> AI események</TabsTrigger><TabsTrigger value="events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> Események</TabsTrigger><TabsTrigger value="operations" className="text-xs sm:text-sm"><Activity className="h-4 w-4 mr-1 hidden sm:inline" /> Operations</TabsTrigger><TabsTrigger value="moderation" className="text-xs sm:text-sm"><ShieldAlert className="h-4 w-4 mr-1 hidden sm:inline" /> Moderáció</TabsTrigger><TabsTrigger value="metrics" className="text-xs sm:text-sm"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Metrikák</TabsTrigger><TabsTrigger value="outcomes" className="text-xs sm:text-sm"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Outcome</TabsTrigger><TabsTrigger value="feature-flags" className="text-xs sm:text-sm"><Flag className="h-4 w-4 mr-1 hidden sm:inline" /> Flagek</TabsTrigger><TabsTrigger value="eventbrite" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Import</TabsTrigger><TabsTrigger value="common-admin" className="text-xs sm:text-sm"><Settings className="h-4 w-4 mr-1 hidden sm:inline" /> Common Admin</TabsTrigger><TabsTrigger value="scraper" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Programgyűjtő</TabsTrigger><TabsTrigger value="partners" className="text-xs sm:text-sm"><Store className="h-4 w-4 mr-1 hidden sm:inline" /> Partnerek</TabsTrigger><TabsTrigger value="clubs" className="text-xs sm:text-sm"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Klubok</TabsTrigger><TabsTrigger value="club-refresh" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Klubfrissítés</TabsTrigger><TabsTrigger value="post-import" className="text-xs sm:text-sm"><ClipboardPaste className="h-4 w-4 mr-1 hidden sm:inline" /> Bejegyzésből</TabsTrigger><TabsTrigger value="community" className="text-xs sm:text-sm"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Circle & Hub</TabsTrigger></TabsList>
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Betöltés…</p>}><TabsContent value="catalog"><AdminCatalog /></TabsContent><TabsContent value="users"><AdminUsers /></TabsContent><TabsContent value="auto-events"><AdminAutoEvents /></TabsContent><TabsContent value="events"><AdminEvents /></TabsContent><TabsContent value="operations"><AdminOperations /></TabsContent><TabsContent value="moderation"><AdminModeration /></TabsContent><TabsContent value="metrics"><AdminMetrics /></TabsContent><TabsContent value="outcomes"><AdminProductOutcomes /></TabsContent><TabsContent value="feature-flags"><AdminFeatureFlags /></TabsContent><TabsContent value="eventbrite"><AdminEventbrite /></TabsContent><TabsContent value="common-admin"><CommonAdminPanel /></TabsContent><TabsContent value="scraper"><AdminScraper /></TabsContent><TabsContent value="partners"><AdminPartnerPerformance /></TabsContent><TabsContent value="clubs"><AdminClubs /></TabsContent><TabsContent value="club-refresh"><AdminClubRefresh /></TabsContent><TabsContent value="post-import"><AdminPostImport /></TabsContent><TabsContent value="community"><Community /></TabsContent></Suspense></Tabs></div></main>
  );
};
export default Admin;
