import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Wand2, Save, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';

const FIRST_NAMES_HU = ['Anna', 'Béla', 'Csaba', 'Dóra', 'Eszter', 'Ferenc', 'Gábor', 'Hajnalka', 'István', 'Judit', 'Katalin', 'László', 'Márton', 'Nóra', 'Olga', 'Péter', 'Réka', 'Sándor', 'Tamás', 'Vera', 'Zoltán', 'Ágnes', 'Balázs', 'Emese', 'Gergő', 'Ildikó', 'Krisztina', 'Miklós', 'Nikolett', 'Rita', 'Szilvia', 'Tibor', 'Zsófia', 'Attila', 'Boglárka', 'Dániel', 'Erika', 'Flóra', 'Henrik', 'Julianna'];
const LAST_NAMES_HU = ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász', 'Lakatos', 'Mészáros', 'Oláh', 'Simon', 'Rácz', 'Fekete', 'Szűcs', 'Török', 'Fehér', 'Balázs', 'Gál', 'Pintér', 'Szalai', 'Budai', 'Szilágyi', 'Vincze'];
const FIRST_NAMES_EU = ['Sophie', 'Maximilian', 'Lukas', 'Emma', 'Jan', 'Marie', 'Thomas', 'Laura', 'Martin', 'Katarina', 'Pavel', 'Ivana', 'Marco', 'Elena', 'Hans', 'Julia', 'Stefan', 'Ana', 'Aleksander', 'Marta'];
const LAST_NAMES_EU = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Novák', 'Dvořák', 'Horák', 'Kučera', 'Kowalski', 'Wiśniewski', 'Popescu', 'Ionescu', 'Marinov', 'Petrov', 'Jovanović', 'Horvat'];

const CITIES_HU = [
  { name: 'Budapest', lat: 47.497, lon: 19.04 },
  { name: 'Debrecen', lat: 47.531, lon: 21.625 },
  { name: 'Szeged', lat: 46.253, lon: 20.148 },
  { name: 'Miskolc', lat: 48.103, lon: 20.778 },
  { name: 'Pécs', lat: 46.072, lon: 18.233 },
  { name: 'Győr', lat: 47.687, lon: 17.634 },
  { name: 'Nyíregyháza', lat: 47.955, lon: 21.717 },
  { name: 'Kecskemét', lat: 46.906, lon: 19.691 },
  { name: 'Székesfehérvár', lat: 47.186, lon: 18.421 },
  { name: 'Szombathely', lat: 47.23, lon: 16.621 },
];

const CITIES_EU = [
  { name: 'Wien', lat: 48.208, lon: 16.373 },
  { name: 'Bratislava', lat: 48.148, lon: 17.107 },
  { name: 'Praha', lat: 50.075, lon: 14.437 },
  { name: 'Zagreb', lat: 45.815, lon: 15.982 },
  { name: 'Ljubljana', lat: 46.056, lon: 14.508 },
  { name: 'Košice', lat: 48.716, lon: 21.261 },
  { name: 'Timișoara', lat: 45.76, lon: 21.226 },
  { name: 'Graz', lat: 47.07, lon: 15.439 },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHobbies(): string[] {
  const allActivities = HOBBY_CATALOG.flatMap((c) => c.subcategories.flatMap((s) => s.activities.map((a) => a.name)));
  const count = 1 + Math.floor(Math.random() * 5);
  const shuffled = [...allActivities].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function jitterCoord(coord: number, range = 0.05): number {
  return coord + (Math.random() - 0.5) * range;
}

interface GeneratedUser {
  id: string;
  display_name: string;
  city: string;
  lat: number;
  lon: number;
  hobbies: string[];
  gender: string;
  age: number;
  bio: string;
}

let idCounter = 0;
function generateUsers(count: number): GeneratedUser[] {
  const users: GeneratedUser[] = [];
  for (let i = 0; i < count; i += 1) {
    const isHungarian = Math.random() < 0.7;
    const firstName = isHungarian ? randomFrom(FIRST_NAMES_HU) : randomFrom(FIRST_NAMES_EU);
    const lastName = isHungarian ? randomFrom(LAST_NAMES_HU) : randomFrom(LAST_NAMES_EU);
    const city = isHungarian ? randomFrom(CITIES_HU) : randomFrom(CITIES_EU);
    const gender = Math.random() < 0.5 ? 'Férfi' : 'Nő';
    const age = 18 + Math.floor(Math.random() * 50);
    users.push({
      id: `gen-${Date.now()}-${++idCounter}`,
      display_name: `${lastName} ${firstName}`,
      city: city.name,
      lat: jitterCoord(city.lat),
      lon: jitterCoord(city.lon),
      hobbies: randomHobbies(),
      gender,
      age,
      bio: `${firstName} ${city.name} városból. Szívesen csatlakozik közösségi programokhoz.`,
    });
  }
  return users;
}

interface Props {
  onUsersCreated?: () => Promise<void> | void;
}

export function AdminMassUsers({ onUsersCreated }: Props) {
  const [count, setCount] = useState(10);
  const [generated, setGenerated] = useState<GeneratedUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Partial<GeneratedUser>>({});

  const handleGenerate = () => {
    if (count < 1 || count > 1000) {
      toast.error('1 és 1000 közötti számot adj meg!');
      return;
    }
    setGenerated((prev) => [...prev, ...generateUsers(count)]);
    toast.success(`${count} felhasználó generálva (előnézet).`);
  };

  const handleRemove = (id: string) => setGenerated((prev) => prev.filter((u) => u.id !== id));

  const startEdit = (user: GeneratedUser) => {
    setEditingId(user.id);
    setEditValue({ display_name: user.display_name, city: user.city, hobbies: user.hobbies });
  };

  const saveEdit = (id: string) => {
    setGenerated((prev) => prev.map((u) => (u.id === id ? { ...u, ...editValue, hobbies: editValue.hobbies ?? u.hobbies } as GeneratedUser : u)));
    setEditingId(null);
    setEditValue({});
  };

  const handleCreateAll = async () => {
    if (generated.length === 0) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('mass-create-users', { body: { users: generated } });
      if (error) throw error;

      const result = data as { created: number; errors?: string[]; profileErrors?: string[] };
      const authErrors = result.errors || [];
      const profileErrors = result.profileErrors || [];
      if (authErrors.length || profileErrors.length) {
        console.error('mass-create-users errors', { authErrors, profileErrors });
        toast.warning(`${result.created} felhasználó auth szinten létrejött, ${authErrors.length + profileErrors.length} részleges hiba.`);
      } else {
        toast.success(`${result.created} felhasználó sikeresen létrehozva!`);
        setGenerated([]);
      }

      if (result.created > 0) {
        await onUsersCreated?.();
      }

      if (!authErrors.length && !profileErrors.length) {
        setGenerated([]);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Hiba: ${err.message || 'Ismeretlen hiba'}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Tömeges felhasználó generátor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Generálandó felhasználók száma</Label>
            <Input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)} className="w-32 rounded-xl h-10" />
          </div>
          <Button onClick={handleGenerate} className="rounded-xl h-10 gap-1.5">
            <Wand2 className="h-4 w-4" /> Generálás
          </Button>
          {generated.length > 0 && (
            <Button onClick={handleCreateAll} disabled={creating} className="rounded-xl h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Save className="h-4 w-4" /> {creating ? 'Létrehozás...' : `${generated.length} felhasználó létrehozása`}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A generált felhasználók magyar és európai neveket, magyarországi és szomszédos országokbeli városokat, valamint véletlenszerű hobbikat kapnak.
          Létrehozás előtt szerkesztheted az adatokat.
        </p>

        {generated.length > 0 && (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] md:max-h-[560px]">
            <Table>
              <TableHeader className="bg-card shadow-sm border-b">
                <TableRow>
                  <TableHead className="sticky top-0 z-20 bg-card">Név</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Város</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Kor</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Nem</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Hobbik</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generated.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      {editingId === u.id ? (
                        <Input value={editValue.display_name || ''} onChange={(e) => setEditValue((prev) => ({ ...prev, display_name: e.target.value }))} className="h-8 text-sm" />
                      ) : (
                        <span className="font-medium">{u.display_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === u.id ? (
                        <Input value={editValue.city || ''} onChange={(e) => setEditValue((prev) => ({ ...prev, city: e.target.value }))} className="h-8 text-sm w-28" />
                      ) : u.city}
                    </TableCell>
                    <TableCell>{u.age}</TableCell>
                    <TableCell>{u.gender}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {u.hobbies.slice(0, 2).map((h) => <Badge key={h} variant="secondary" className="text-[10px]">{h}</Badge>)}
                        {u.hobbies.length > 2 && <Badge variant="outline" className="text-[10px]">+{u.hobbies.length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {editingId === u.id ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(u.id)}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(u)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleRemove(u.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
