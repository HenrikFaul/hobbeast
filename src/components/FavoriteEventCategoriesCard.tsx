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
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Only show hobby catalog categories that the user has in their hobbies
  const availableCategories = HOBBY_CATALOG
    .map(c => c.name)
    .filter(catName => {
      if (hobbies.length === 0) return true; // show all if no hobbies set
      // Check if any of the user's hobbies relate to this category
      const cat = HOBBY_CATALOG.find(c => c.name === catName);
      if (!cat) return false;
      const catKeywords = [
        cat.name,
        ...cat.subcategories.map(s => s.name),
        ...cat.subcategories.flatMap(s => s.activities.map(a => a.name)),
      ].map(k => k.toLowerCase());
      return hobbies.some(h => catKeywords.some(k => k.includes(h.toLowerCase()) || h.toLowerCase().includes(k)));
    });

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('favorite_event_categories,hobbies').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setFavorites((data as any).favorite_event_categories || []);
          setHobbies((data as any).hobbies || []);
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
          Az érdeklődési köreidből szűkítheted le a kedvenc kategóriáidat – értesítést kapsz, ha ezekre új esemény készül.
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
          {availableCategories.filter(c => !favorites.includes(c)).map(cat => (
            <Badge key={cat} variant="outline" className="rounded-lg cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => toggle(cat)}>
              + {cat}
            </Badge>
          ))}
          {availableCategories.length === 0 && hobbies.length > 0 && (
            <p className="text-sm text-muted-foreground italic">Nincs elérhető kategória az érdeklődési köreid alapján.</p>
          )}
        </div>

        <Button onClick={handleSave} className="w-full rounded-xl h-11 gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Mentés...' : 'Kedvencek mentése'}
        </Button>
      </CardContent>
    </Card>
  );
}
