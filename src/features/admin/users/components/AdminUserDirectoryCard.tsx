import { useState, type Dispatch, type SetStateAction } from 'react';
import { Ban, CheckCircle2, Eye, Filter, Mail, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ADMIN_USER_ROW_HEIGHT,
  ADMIN_USER_TABLE_HEAD_HEIGHT,
  countProfileOrigins,
  formatUserOrigin,
  type PageSize,
} from '../domain';
import type { AdminUsersController } from '../useAdminUsersController';

interface AdminUserDirectoryCardProps {
  model: AdminUsersController['directory'];
}

export function AdminUserDirectoryCard({ model }: AdminUserDirectoryCardProps) {
  const [expandedHobbies, setExpandedHobbies] = useState<Set<string>>(new Set());
  const [expandedUserHubs, setExpandedUserHubs] = useState<Set<string>>(new Set());
  const originCounts = countProfileOrigins(model.profiles);

  const toggleExpanded = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    userId: string,
    expanded: boolean,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (expanded) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2 flex-wrap">
            <Users className="h-5 w-5 text-primary" />
            <span>Felhasználók: {model.profiles.length} összes</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({originCounts.real} valódi / {originCounts.generated} generált / {originCounts.unknown} ismeretlen)
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              value={model.search}
              onChange={(event) => model.setSearch(event.target.value)}
              placeholder="Keresés név, város, hobbi alapján"
              aria-label="Felhasználók keresése"
              className="w-64 rounded-xl"
            />
            <Select value={String(model.pageSize)} onValueChange={(value) => model.setPageSize(Number(value) as PageSize)}>
              <SelectTrigger className="w-28 rounded-xl" aria-label="Látható táblamagasság">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 sor</SelectItem>
                <SelectItem value="20">20 sor</SelectItem>
                <SelectItem value="50">50 sor</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="rounded-xl gap-2" onClick={model.openBulkSelection}>
              <Filter className="h-4 w-4" /> Tömeges kijelölés
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="rounded-xl gap-2"
            disabled={model.selectedUserIds.size === 0 || !model.selectedGeneratedOnly}
            onClick={() => model.openBulkAction('delete')}
          >
            <Trash2 className="h-4 w-4" /> Törlés
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2"
            disabled={model.selectedUserIds.size === 0}
            onClick={() => model.openBulkAction('activate')}
          >
            <CheckCircle2 className="h-4 w-4" /> Aktiválás
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2"
            disabled={model.selectedUserIds.size === 0}
            onClick={() => model.openBulkAction('deactivate')}
          >
            <Ban className="h-4 w-4" /> Deaktiválás
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl gap-2" disabled>
            <Mail className="h-4 w-4" /> Emlékeztető kiküldése
          </Button>
          <Badge variant="outline">Kijelölve: {model.selectedUserIds.size}</Badge>
          {model.lastBulkJobId && <Badge variant="secondary">Utolsó job: {model.lastBulkJobId}</Badge>}
        </div>

        {model.profilesLoading ? (
          <div className="flex justify-center py-8" role="status" aria-label="Felhasználók betöltése">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : model.visibleProfiles.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nincs megjeleníthető felhasználó.</p>
        ) : (
          <div
            className="overflow-x-auto overflow-y-auto max-h-[70vh] md:max-h-[calc(100vh-250px)]"
            style={{ height: model.pageSize * ADMIN_USER_ROW_HEIGHT + ADMIN_USER_TABLE_HEAD_HEIGHT }}
          >
            <Table containerClassName="relative w-full">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm border-b">
                <TableRow>
                  <TableHead className="w-10 sticky top-0 z-20 bg-card">
                    <Checkbox
                      checked={model.allVisibleSelected}
                      onCheckedChange={(value) => model.toggleVisible(Boolean(value))}
                      aria-label="Minden látható felhasználó kijelölése"
                    />
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Név</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Forrás</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Státusz</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Város</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Hobbik</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Hub</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Regisztráció</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card">Utolsó aktivitás</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-card"><span className="sr-only">Művelet</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.visibleProfiles.map((profile) => {
                  const hobbies = profile.hobbies || [];
                  const hobbiesExpanded = expandedHobbies.has(profile.user_id);
                  const visibleHobbies = hobbiesExpanded ? hobbies : hobbies.slice(0, 1);
                  const hobbyExtra = hobbies.length - 1;
                  const userHubs = model.userHubMap.get(profile.user_id) || [];
                  const hubsExpanded = expandedUserHubs.has(profile.user_id);
                  const visibleHubs = hubsExpanded ? userHubs : userHubs.slice(0, 1);
                  const hubExtra = userHubs.length - 1;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(profile.user_id) && model.selectedUserIds.has(profile.user_id)}
                          disabled={!profile.user_id}
                          onCheckedChange={(value) => profile.user_id && model.toggleSingle(profile.user_id, Boolean(value))}
                          aria-label={`${profile.display_name || 'Névtelen felhasználó'} kijelölése`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{profile.display_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={profile.user_origin === 'generated' ? 'secondary' : 'outline'}>
                          {formatUserOrigin(profile.user_origin)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={profile.is_active === false ? 'destructive' : 'default'}>
                          {profile.is_active === false ? 'Inaktív' : 'Aktív'}
                        </Badge>
                      </TableCell>
                      <TableCell>{profile.city || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {visibleHobbies.map((hobby) => <Badge key={hobby} variant="secondary" className="text-xs">{hobby}</Badge>)}
                          {!hobbiesExpanded && hobbyExtra > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-5 rounded-full px-1.5 text-xs"
                              onClick={() => toggleExpanded(setExpandedHobbies, profile.user_id, false)}
                              aria-label={`${hobbyExtra} további hobbi megjelenítése`}
                            >
                              +{hobbyExtra}
                            </Button>
                          )}
                          {hobbiesExpanded && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-5 rounded-full px-1.5 text-xs"
                              onClick={() => toggleExpanded(setExpandedHobbies, profile.user_id, true)}
                              aria-label="Hobbik összecsukása"
                            >
                              ▲
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {userHubs.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {visibleHubs.map((hub) => (
                            <Badge key={hub.id} variant="secondary" className="text-xs">
                              {hub.hobby_category}{hub.city ? ` · ${hub.city}` : ''}
                            </Badge>
                          ))}
                          {!hubsExpanded && hubExtra > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-5 rounded-full px-1.5 text-xs"
                              onClick={() => toggleExpanded(setExpandedUserHubs, profile.user_id, false)}
                              aria-label={`${hubExtra} további Hub megjelenítése`}
                            >
                              +{hubExtra}
                            </Button>
                          )}
                          {hubsExpanded && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-5 rounded-full px-1.5 text-xs"
                              onClick={() => toggleExpanded(setExpandedUserHubs, profile.user_id, true)}
                              aria-label="Hubok összecsukása"
                            >
                              ▲
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(profile.created_at).toLocaleDateString('hu-HU')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(profile.updated_at).toLocaleDateString('hu-HU')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void model.openDetail(profile)}
                          aria-label={`${profile.display_name || 'Felhasználó'} részletei`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
