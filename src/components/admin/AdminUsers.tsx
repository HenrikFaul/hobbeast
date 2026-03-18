import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  city: string | null;
  hobbies: string[] | null;
  created_at: string;
  avatar_url: string | null;
}

export function AdminUsers() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, user_id, display_name, city, hobbies, created_at, avatar_url')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfiles((data as ProfileRow[]) || []);
        setLoading(false);
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Regisztrált felhasználók ({profiles.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nincs regisztrált felhasználó.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Név</TableHead>
                  <TableHead>Város</TableHead>
                  <TableHead>Hobbik</TableHead>
                  <TableHead>Regisztráció</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.display_name || '—'}</TableCell>
                    <TableCell>{p.city || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.hobbies || []).slice(0, 3).map((h) => (
                          <Badge key={h} variant="secondary" className="text-xs">{h}</Badge>
                        ))}
                        {(p.hobbies || []).length > 3 && (
                          <Badge variant="outline" className="text-xs">+{(p.hobbies!.length - 3)}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString('hu-HU')}
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
