import { useState } from "react";
import { HOBBY_CATALOG, HobbyCategory, HobbySubcategory, HobbyActivity, getCatalogStats } from "@/lib/hobbyCategories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Layers, FolderTree, Activity } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function AdminCatalog() {
  const stats = getCatalogStats();
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSub = (id: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Layers className="h-6 w-6 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold font-display">{stats.categories}</div>
            <p className="text-xs text-muted-foreground">Kategória</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <FolderTree className="h-6 w-6 mx-auto mb-1 text-accent" />
            <div className="text-2xl font-bold font-display">{stats.subcategories}</div>
            <p className="text-xs text-muted-foreground">Alkategória</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-1 text-warning" />
            <div className="text-2xl font-bold font-display">{stats.activities}</div>
            <p className="text-xs text-muted-foreground">Tevékenység</p>
          </CardContent>
        </Card>
      </div>

      {/* Category tree */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Hobbikatalógus fa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {HOBBY_CATALOG.map((cat) => (
            <Collapsible key={cat.id} open={expandedCats.has(cat.id)} onOpenChange={() => toggleCat(cat.id)}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start text-left h-auto py-2">
                  {expandedCats.has(cat.id) ? <ChevronDown className="h-4 w-4 mr-2 shrink-0" /> : <ChevronRight className="h-4 w-4 mr-2 shrink-0" />}
                  <span className="mr-2">{cat.emoji}</span>
                  <span className="font-semibold">{cat.name}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{cat.subcategories.length} alk.</Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-8 space-y-1">
                {cat.subcategories.map((sub) => (
                  <Collapsible key={sub.id} open={expandedSubs.has(sub.id)} onOpenChange={() => toggleSub(sub.id)}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-start text-left h-auto py-1.5">
                        {expandedSubs.has(sub.id) ? <ChevronDown className="h-3.5 w-3.5 mr-2 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mr-2 shrink-0" />}
                        <span className="mr-1.5">{sub.emoji}</span>
                        <span className="text-sm">{sub.name}</span>
                        <Badge variant="outline" className="ml-auto text-xs">{sub.activities.length}</Badge>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-8">
                      <div className="flex flex-wrap gap-1.5 py-2">
                        {sub.activities.map((act) => (
                          <Badge key={act.id} variant="secondary" className="text-xs">
                            {act.emoji || sub.emoji} {act.name}
                          </Badge>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        A katalógus jelenleg kódban van definiálva. Adatbázis-alapú szerkesztés hamarosan.
      </p>
    </div>
  );
}
