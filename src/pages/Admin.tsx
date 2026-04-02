import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, BookOpen, Calendar, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminCatalog } from "@/components/admin/AdminCatalog";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminEvents } from "@/components/admin/AdminEvents";
import { AdminMetrics } from "@/components/admin/AdminMetrics";
import { AdminEventbrite } from "@/components/admin/AdminEventbrite";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && !adminLoading && user && !isAdmin) navigate("/");
  }, [authLoading, adminLoading, user, isAdmin, navigate]);

  if (authLoading || adminLoading) {
    return (
      <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 page-stack">
        <PageHeader
          eyebrow="Admin felület"
          title="Központi működtetés és felügyelet"
          subtitle="A Hobbeast admin nézet a katalógus, a felhasználók, az események, a metrikák és az importfolyamatok egységes karbantartási felülete."
          actions={
            <div className="grid w-full gap-3 sm:grid-cols-5">
              {[
                { label: "Katalógus", icon: BookOpen },
                { label: "Felhasználók", icon: Users },
                { label: "Események", icon: Calendar },
                { label: "Metrikák", icon: BarChart3 },
                { label: "Import", icon: RefreshCw },
              ].map((item) => (
                <div key={item.label} className="metric-tile flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-medium">{item.label}</div>
                </div>
              ))}
            </div>
          }
        />

        <section className="surface-panel p-3 sm:p-4">
          <Tabs defaultValue="catalog" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[1.5rem] bg-muted/50 p-2 sm:grid-cols-5">
              <TabsTrigger value="catalog" className="rounded-xl py-3 text-xs sm:text-sm">
                <BookOpen className="mr-2 h-4 w-4" /> Katalógus
              </TabsTrigger>
              <TabsTrigger value="users" className="rounded-xl py-3 text-xs sm:text-sm">
                <Users className="mr-2 h-4 w-4" /> Felhasználók
              </TabsTrigger>
              <TabsTrigger value="events" className="rounded-xl py-3 text-xs sm:text-sm">
                <Calendar className="mr-2 h-4 w-4" /> Események
              </TabsTrigger>
              <TabsTrigger value="metrics" className="rounded-xl py-3 text-xs sm:text-sm">
                <BarChart3 className="mr-2 h-4 w-4" /> Metrikák
              </TabsTrigger>
              <TabsTrigger value="eventbrite" className="rounded-xl py-3 text-xs sm:text-sm">
                <RefreshCw className="mr-2 h-4 w-4" /> Import
              </TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="mt-4">
              <AdminCatalog />
            </TabsContent>
            <TabsContent value="users" className="mt-4">
              <AdminUsers />
            </TabsContent>
            <TabsContent value="events" className="mt-4">
              <AdminEvents />
            </TabsContent>
            <TabsContent value="metrics" className="mt-4">
              <AdminMetrics />
            </TabsContent>
            <TabsContent value="eventbrite" className="mt-4">
              <AdminEventbrite />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
};

export default Admin;
