import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, Calendar, TrendingUp } from "lucide-react";
import { getCatalogStats } from "@/lib/hobbyCategories";

interface Metrics {
  totalUsers: number;
  totalEvents: number;
  activeEvents: number;
  totalParticipations: number;
  catalogStats: { categories: number; subcategories: number; activities: number };
}

export function AdminMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('event_participants').select('id', { count: 'exact', head: true }),
    ]).then(([usersRes, eventsRes, activeRes, partRes]) => {
      setMetrics({
        totalUsers: usersRes.count || 0,
        totalEvents: eventsRes.count || 0,
        activeEvents: activeRes.count || 0,
        totalParticipations: partRes.count || 0,
        catalogStats: getCatalogStats(),
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    { icon: Users, label: 'Regisztrált felhasználók', value: metrics.totalUsers, color: 'text-primary' },
    { icon: Calendar, label: 'Összes esemény', value: metrics.totalEvents, color: 'text-accent' },
    { icon: Calendar, label: 'Aktív események', value: metrics.activeEvents, color: 'text-success' },
    { icon: TrendingUp, label: 'Összes csatlakozás', value: metrics.totalParticipations, color: 'text-warning' },
    { icon: BarChart3, label: 'Kategóriák', value: metrics.catalogStats.categories, color: 'text-primary' },
    { icon: BarChart3, label: 'Tevékenységek', value: metrics.catalogStats.activities, color: 'text-accent' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <Card key={i}>
          <CardContent className="pt-5 text-center">
            <c.icon className={`h-6 w-6 mx-auto mb-2 ${c.color}`} />
            <div className="text-2xl font-bold font-display">{c.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
