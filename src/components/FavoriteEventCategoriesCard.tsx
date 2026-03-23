import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';

export function FavoriteEventCategoriesCard() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const allCategories = HOBBY_CATALOG.map(c => c.name);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('favorite_event_categories').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data && (data as any).favorite_event_categories) {
          setFavorites((data as any).favorite_event_categories);
        }
      });
  }, [user]);

  const toggle = (cat: string) => {
    setFavorites(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ favorite_event_categories: favorites } as any)
      .eq('user_id', user.id);
    if (error) toast.error('Hiba a mentés során.');
    else toast.success('Kedvenc kategóriák mentve!');
    setSaving(false);
  };

  return (
    <Card className="rounded-2xl shadow-card border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10">
            <Star className="h-5 w-5 text-warning" />
          </div>
          Kedvenc eseménykategóriák
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Válaszd ki a kedvenc kategóriáidat – értesítést kapsz, ha ezekre új esemény készül.
        </p>

        {favorites.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {favorites.map(c => (
              <Badge key={c} className="rounded-lg gradient-primary text-primary-foreground border-0 cursor-pointer" onClick={() => toggle(c)}>
                {c} <X className="ml-1 h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {allCategories.filter(c => !favorites.includes(c)).map(cat => (
            <Badge key={cat} variant="outline" className="rounded-lg cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => toggle(cat)}>
              + {cat}
            </Badge>
          ))}
        </div>

        <Button onClick={handleSave} className="w-full rounded-xl h-11 gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Mentés...' : 'Kedvencek mentése'}
        </Button>
      </CardContent>
    </Card>
  );
}
