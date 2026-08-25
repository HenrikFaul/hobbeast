import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Shield, ShieldAlert, BookOpen, Users, Calendar, BarChart3, Flag, RefreshCw, Settings, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminCatalog } from "@/components/admin/AdminCatalog";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminAutoEvents } from "@/components/admin/AdminAutoEvents";
import { AdminEvents } from "@/components/admin/AdminEvents";
import { AdminMetrics } from "@/components/admin/AdminMetrics";
import { AdminEventbrite } from "@/components/admin/AdminEventbrite";
import { CommonAdminPanel } from "@/components/admin/CommonAdminPanel";
import { AdminModeration } from "@/components/admin/AdminModeration";
import { AdminProductOutcomes } from "@/components/admin/AdminProductOutcomes";
import { AdminFeatureFlags } from "@/components/admin/AdminFeatureFlags";
import { AdminOperations } from "@/components/admin/AdminOperations";
import { AdminScraper } from "@/components/admin/AdminScraper";
import { AdminPartnerPerformance } from "@/components/admin/AdminPartnerPerformance";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedTabs = ['catalog', 'users', 'auto-events', 'events', 'operations', 'moderation', 'metrics', 'outcomes', 'feature-flags', 'eventbrite', 'common-admin', 'scraper', 'partners'] as const;
  const searchTab = searchParams.get('tab');
  const activeTab = allowedTabs.includes(searchTab as (typeof allowedTabs)[number]) ? searchTab : 'catalog';
  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user) {
      navigate('/auth');
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
      ><TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-13"><TabsTrigger value="catalog" className="text-xs sm:text-sm"><BookOpen className="h-4 w-4 mr-1 hidden sm:inline" /> Katalógus</TabsTrigger><TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Felhasználók</TabsTrigger><TabsTrigger value="auto-events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> AI események</TabsTrigger><TabsTrigger value="events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> Események</TabsTrigger><TabsTrigger value="operations" className="text-xs sm:text-sm"><Activity className="h-4 w-4 mr-1 hidden sm:inline" /> Operations</TabsTrigger><TabsTrigger value="moderation" className="text-xs sm:text-sm"><ShieldAlert className="h-4 w-4 mr-1 hidden sm:inline" /> Moderáció</TabsTrigger><TabsTrigger value="metrics" className="text-xs sm:text-sm"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Metrikák</TabsTrigger><TabsTrigger value="outcomes" className="text-xs sm:text-sm"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Outcome</TabsTrigger><TabsTrigger value="feature-flags" className="text-xs sm:text-sm"><Flag className="h-4 w-4 mr-1 hidden sm:inline" /> Flagek</TabsTrigger><TabsTrigger value="eventbrite" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Import</TabsTrigger><TabsTrigger value="common-admin" className="text-xs sm:text-sm"><Settings className="h-4 w-4 mr-1 hidden sm:inline" /> Common Admin</TabsTrigger><TabsTrigger value="scraper" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Programgyűjtő</TabsTrigger><TabsTrigger value="partners" className="text-xs sm:text-sm"><Store className="h-4 w-4 mr-1 hidden sm:inline" /> Partnerek</TabsTrigger></TabsList>
      <TabsContent value="catalog"><AdminCatalog /></TabsContent><TabsContent value="users"><AdminUsers /></TabsContent><TabsContent value="auto-events"><AdminAutoEvents /></TabsContent><TabsContent value="events"><AdminEvents /></TabsContent><TabsContent value="operations"><AdminOperations /></TabsContent><TabsContent value="moderation"><AdminModeration /></TabsContent><TabsContent value="metrics"><AdminMetrics /></TabsContent><TabsContent value="outcomes"><AdminProductOutcomes /></TabsContent><TabsContent value="feature-flags"><AdminFeatureFlags /></TabsContent><TabsContent value="eventbrite"><AdminEventbrite /></TabsContent><TabsContent value="common-admin"><CommonAdminPanel /></TabsContent><TabsContent value="scraper"><AdminScraper /></TabsContent><TabsContent value="partners"><AdminPartnerPerformance /></TabsContent></Tabs></div></main>
  );
};
export default Admin;
