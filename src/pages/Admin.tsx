import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, BookOpen, Users, Calendar, BarChart3, RefreshCw, Settings, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminCatalog } from "@/components/admin/AdminCatalog";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminAutoEvents } from "@/components/admin/AdminAutoEvents";
import { AdminEvents } from "@/components/admin/AdminEvents";
import { AdminMetrics } from "@/components/admin/AdminMetrics";
import { AdminEventbrite } from "@/components/admin/AdminEventbrite";
import { CommonAdminPanel } from "@/components/admin/CommonAdminPanel";
import { AdminAddressManager } from "@/components/admin/AdminAddressManager";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedTabs = ['catalog', 'users', 'auto-events', 'events', 'metrics', 'eventbrite', 'common-admin', 'address-manager'] as const;
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
      ><TabsList className="grid w-full grid-cols-3 md:grid-cols-8 mb-6"><TabsTrigger value="catalog" className="text-xs sm:text-sm"><BookOpen className="h-4 w-4 mr-1 hidden sm:inline" /> Katalógus</TabsTrigger><TabsTrigger value="users" className="text-xs sm:text-sm"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Felhasználók</TabsTrigger><TabsTrigger value="auto-events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> AI események</TabsTrigger><TabsTrigger value="events" className="text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> Események</TabsTrigger><TabsTrigger value="metrics" className="text-xs sm:text-sm"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Metrikák</TabsTrigger><TabsTrigger value="eventbrite" className="text-xs sm:text-sm"><RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Import</TabsTrigger><TabsTrigger value="common-admin" className="text-xs sm:text-sm"><Settings className="h-4 w-4 mr-1 hidden sm:inline" /> Common Admin</TabsTrigger><TabsTrigger value="address-manager" className="text-xs sm:text-sm"><MapPin className="h-4 w-4 mr-1 hidden sm:inline" /> Címkezelő</TabsTrigger></TabsList>
      <TabsContent value="catalog"><AdminCatalog /></TabsContent><TabsContent value="users"><AdminUsers /></TabsContent><TabsContent value="auto-events"><AdminAutoEvents /></TabsContent><TabsContent value="events"><AdminEvents /></TabsContent><TabsContent value="metrics"><AdminMetrics /></TabsContent><TabsContent value="eventbrite"><AdminEventbrite /></TabsContent><TabsContent value="common-admin"><CommonAdminPanel /></TabsContent><TabsContent value="address-manager"><AdminAddressManager /></TabsContent></Tabs></div></main>
  );
};
export default Admin;
