import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, BookOpen, Users, Calendar, BarChart3, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
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
    if (!authLoading && !user) navigate('/auth');
    if (!authLoading && !adminLoading && user && !isAdmin) navigate('/');
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
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold font-display">Admin felület</h1>
        </div>

        <Tabs defaultValue="catalog" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="catalog" className="text-xs sm:text-sm">
              <BookOpen className="h-4 w-4 mr-1 hidden sm:inline" /> Katalógus
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm">
              <Users className="h-4 w-4 mr-1 hidden sm:inline" /> Felhasználók
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs sm:text-sm">
              <Calendar className="h-4 w-4 mr-1 hidden sm:inline" /> Események
            </TabsTrigger>
            <TabsTrigger value="metrics" className="text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" /> Metrikák
            </TabsTrigger>
            <TabsTrigger value="eventbrite" className="text-xs sm:text-sm">
              <RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" /> Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog"><AdminCatalog /></TabsContent>
          <TabsContent value="users"><AdminUsers /></TabsContent>
          <TabsContent value="events"><AdminEvents /></TabsContent>
          <TabsContent value="metrics"><AdminMetrics /></TabsContent>
          <TabsContent value="eventbrite"><AdminEventbrite /></TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default Admin;
