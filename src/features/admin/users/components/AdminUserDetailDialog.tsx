import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatUserOrigin } from '../domain';
import type { AdminUsersController } from '../useAdminUsersController';

interface AdminUserDetailDialogProps {
  model: AdminUsersController['detail'];
}

export function AdminUserDetailDialog({ model }: AdminUserDetailDialogProps) {
  const profile = model.selectedUser;
  const hobbyQuery = model.hobbySearch.trim().toLocaleLowerCase('hu-HU');
  const eventQuery = model.eventSearch.trim().toLocaleLowerCase('hu-HU');

  return (
    <Dialog open={Boolean(profile)} onOpenChange={(open) => { if (!open) model.close(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> {profile?.display_name || 'Felhasználó'}
          </DialogTitle>
          <DialogDescription>
            Allowlisted profiladatok és eseményrészvételek; minden mentés capability-ellenőrzött és auditált.
          </DialogDescription>
        </DialogHeader>

        {profile && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Város</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {profile.city || '—'}{profile.district ? `, ${profile.district}` : ''}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Korcsoport</p>
                <p className="font-medium">{profile.age_band ? `${profile.age_band} év` : '—'}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-edit-gender" className="text-muted-foreground text-xs">Nem</Label>
                <Select value={model.gender} onValueChange={model.setGender}>
                  <SelectTrigger id="profile-edit-gender" className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Nincs megadva</SelectItem>
                    <SelectItem value="male">Férfi</SelectItem>
                    <SelectItem value="female">Nő</SelectItem>
                    <SelectItem value="other">Egyéb</SelectItem>
                    <SelectItem value="prefer_not_to_say">Nem szeretné megadni</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Keresési sugár</p>
                <p className="font-medium">{profile.preferred_radius_km ? `${profile.preferred_radius_km} km` : '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Forrás</p>
                <p className="font-medium">{formatUserOrigin(profile.user_origin)}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-edit-status" className="text-muted-foreground text-xs">Státusz</Label>
                <Select value={model.activeStatus} onValueChange={model.setActiveStatus}>
                  <SelectTrigger id="profile-edit-status" className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktív</SelectItem>
                    <SelectItem value="inactive">Inaktív</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="profile-edit-bio" className="text-muted-foreground text-xs">Bio</Label>
                <Textarea
                  id="profile-edit-bio"
                  value={model.bio}
                  onChange={(event) => model.setBio(event.target.value.slice(0, 500))}
                  maxLength={500}
                  rows={3}
                  className="resize-none"
                  placeholder="Legfeljebb 500 karakter."
                />
                <p className="text-[11px] text-muted-foreground text-right">{model.bio.length}/500</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Regisztráció</p>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {new Date(profile.created_at).toLocaleDateString('hu-HU')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Utolsó aktivitás</p>
                <p className="font-medium">{new Date(profile.updated_at).toLocaleDateString('hu-HU')}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="profile-hobby-search" className="text-xs text-muted-foreground mb-2 block">
                Hobbik ({(profile.hobbies || []).length})
              </Label>
              <Input
                id="profile-hobby-search"
                value={model.hobbySearch}
                onChange={(event) => model.setHobbySearch(event.target.value)}
                placeholder="Hobbi keresés..."
                className="mb-2 h-8"
              />
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1">
                {model.hobbyOptions
                  .filter((hobby) => hobby.toLocaleLowerCase('hu-HU').includes(hobbyQuery))
                  .slice(0, 120)
                  .map((hobby) => (
                    <label key={hobby} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={model.selectedHobbies.has(hobby)}
                        onCheckedChange={(checked) => model.toggleHobby(hobby, Boolean(checked))}
                        aria-label={`${hobby} hobbi`}
                      />
                      <span>{hobby}</span>
                    </label>
                  ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {model.selectedHobbies.size === 0 && <p className="text-sm text-muted-foreground">Nincs kiválasztva</p>}
                {Array.from(model.selectedHobbies).map((hobby) => <Badge key={hobby} variant="secondary">{hobby}</Badge>)}
              </div>
            </div>

            <div>
              <Label htmlFor="profile-event-search" className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Esemény részvételek ({model.participations.length})
              </Label>
              <Input
                id="profile-event-search"
                value={model.eventSearch}
                onChange={(event) => model.setEventSearch(event.target.value)}
                placeholder="Esemény keresés cím vagy kategória alapján..."
                className="mb-2 h-8"
              />
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1 mb-2">
                {model.events
                  .filter((event) => !eventQuery
                    || `${event.title} ${event.category || ''}`.toLocaleLowerCase('hu-HU').includes(eventQuery))
                  .map((event) => (
                    <label key={event.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={model.selectedEventIds.has(event.id)}
                        onCheckedChange={(checked) => model.toggleEvent(event.id, Boolean(checked))}
                        aria-label={`${event.title} részvétel`}
                      />
                      <span>
                        {event.title}
                        <span className="text-xs text-muted-foreground">
                          {' · '}{event.category || '—'} · {event.event_date ? new Date(event.event_date).toLocaleDateString('hu-HU') : '—'}
                        </span>
                      </span>
                    </label>
                  ))}
              </div>

              {model.loading ? (
                <div className="flex justify-center py-4" role="status" aria-label="Profilrészletek betöltése">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                </div>
              ) : model.participations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Még nem csatlakozott eseményhez.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {model.participations.map((participation) => (
                    <div key={participation.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm">
                      <span>{participation.event?.image_emoji || '🎉'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{participation.event?.title || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {participation.event?.category} · {participation.event?.event_date
                            ? new Date(participation.event.event_date).toLocaleDateString('hu-HU')
                            : '—'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(participation.joined_at).toLocaleDateString('hu-HU')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-edit-reason">Módosítás indoka</Label>
              <Textarea
                id="profile-edit-reason"
                value={model.reason}
                onChange={(event) => model.setReason(event.target.value.slice(0, 1000))}
                maxLength={1000}
                rows={2}
                placeholder="Kötelező, auditálható műveleti indok."
                aria-describedby="profile-edit-reason-help"
              />
              <p id="profile-edit-reason-help" className="text-xs text-muted-foreground">
                Az indok az admin auditnaplóba kerül; érzékeny személyes adatot ne írj ide.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                className="rounded-xl"
                onClick={() => void model.save()}
                disabled={model.saving || model.loading || model.reason.trim().length < 3}
              >
                {model.saving ? 'Mentés...' : 'Profil mentése'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
