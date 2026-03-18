import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Eye, Calendar, MapPin, Clock } from "lucide-react";

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  city: string | null;
  district: string | null;
  hobbies: string[] | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  date_of_birth: string | null;
  preferred_radius_km: number | null;
}

interface EventParticipation {
  id: string;
  joined_at: string;
  event: {
    id: string;
    title: string;
    category: string;
    event_date: string | null;
    image_emoji: string | null;
  };
}

export function AdminUsers() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null);
  const [participations, setParticipations] = useState<EventParticipation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfiles((data as ProfileRow[]) || []);
        setLoading(false);
      });
  }, []);

  const openDetail = async (profile: ProfileRow) => {
    setSelectedUser(profile);
    setDetailLoading(true);
    const { data } = await supabase
      .from('event_participants')
      .select('id, joined_at, event:events(id, title, category, event_date, image_emoji)')
      .eq('user_id', profile.user_id)
      .order('joined_at', { ascending: false });
    setParticipations((data as unknown as EventParticipation[]) || []);
    setDetailLoading(false);
  };

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  const getLastActivity = (profile: ProfileRow) => {
    return new Date(profile.updated_at).toLocaleDateString('hu-HU');
  };

  return (
    <>
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
                    <TableHead>Utolsó aktivitás</TableHead>
                    <TableHead></TableHead>
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
                            <Badge variant="outline" className="text-xs">+{p.hobbies!.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString('hu-HU')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getLastActivity(p)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openDetail(p)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {selectedUser?.display_name || 'Felhasználó'}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-5">
              {/* Profile info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Város</p>
                  <p className="font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {selectedUser.city || '—'}{selectedUser.district ? `, ${selectedUser.district}` : ''}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Kor</p>
                  <p className="font-medium">{getAge(selectedUser.date_of_birth) ? `${getAge(selectedUser.date_of_birth)} év` : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Nem</p>
                  <p className="font-medium">{selectedUser.gender || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Keresési sugár</p>
                  <p className="font-medium">{selectedUser.preferred_radius_km ? `${selectedUser.preferred_radius_km} km` : '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Bio</p>
                  <p className="font-medium">{selectedUser.bio || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Regisztráció</p>
                  <p className="font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(selectedUser.created_at).toLocaleDateString('hu-HU')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Utolsó aktivitás</p>
                  <p className="font-medium">{getLastActivity(selectedUser)}</p>
                </div>
              </div>

              {/* Hobbies */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Hobbik ({(selectedUser.hobbies || []).length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedUser.hobbies || []).length === 0 && <p className="text-sm text-muted-foreground">Nincs megadva</p>}
                  {(selectedUser.hobbies || []).map((h) => (
                    <Badge key={h} variant="secondary">{h}</Badge>
                  ))}
                </div>
              </div>

              {/* Event participations */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Esemény részvételek ({participations.length})
                </p>
                {detailLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                  </div>
                ) : participations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Még nem csatlakozott eseményhez.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {participations.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm">
                        <span>{p.event?.image_emoji || '🎉'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.event?.title || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.event?.category} · {p.event?.event_date ? new Date(p.event.event_date).toLocaleDateString('hu-HU') : '—'}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.joined_at).toLocaleDateString('hu-HU')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
