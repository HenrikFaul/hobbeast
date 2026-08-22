import { useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { HubDetailModal } from '@/components/admin/HubDetailModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ADMIN_USER_ROW_HEIGHT,
  ADMIN_USER_TABLE_HEAD_HEIGHT,
  type PageSize,
  type VirtualHub,
} from '../domain';
import type { AdminUsersController } from '../useAdminUsersController';

interface AdminVirtualHubsCardProps {
  model: AdminUsersController['hubs'];
}

export function AdminVirtualHubsCard({ model }: AdminVirtualHubsCardProps) {
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [selectedHub, setSelectedHub] = useState<VirtualHub | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openHub = (hub: VirtualHub) => {
    setSelectedHub(hub);
    setDetailOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" /> Virtuális közösségek ({model.hubs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as PageSize)}>
                <SelectTrigger className="w-28 rounded-xl h-8" aria-label="Hub táblamagasság">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 sor</SelectItem>
                  <SelectItem value="20">20 sor</SelectItem>
                  <SelectItem value="50">50 sor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                disabled={model.hubsReconciling || model.hubsLoading}
                onClick={() => void model.reconcileHubs()}
                title="Idempotens, felhasználónként zárolt tagsági egyeztetés"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${model.hubsReconciling ? 'animate-spin' : ''}`} />
                {model.hubsReconciling ? 'Egyeztetés…' : 'Hubok egyeztetése'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A tagságok felhasználónként, idempotensen és tranzakciós zárral egyeztethetők. Csak az admin által felfedezhetővé tett, aktív hubok kerülnek a tagi előnézetbe.
          </p>
          {model.hubOriginStatus === 'missing_column' && (
            <p className="text-xs text-destructive mt-2" role="alert">
              A user_origin mező nem érhető el ebben az adatbázisban, ezért a valódi és generált kereslet nem választható szét. Az AI eseménygenerálás biztonsági okból blokkolva marad.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {model.hubsLoading ? (
            <div className="flex justify-center py-8" role="status" aria-label="Hubok betöltése">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : model.hubs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nincsenek virtuális közösségek. Indíts biztonságos tagsági egyeztetést.</p>
          ) : (
            <div
              className="overflow-x-auto overflow-y-auto max-h-[70vh] md:max-h-[calc(100vh-300px)]"
              style={{ height: pageSize * ADMIN_USER_ROW_HEIGHT + ADMIN_USER_TABLE_HEAD_HEIGHT }}
            >
              <Table containerClassName="relative w-full">
                <TableHeader className="sticky top-0 z-10 bg-card shadow-sm border-b">
                  <TableRow>
                    <TableHead>Érdeklődési kör</TableHead>
                    <TableHead>Város</TableHead>
                    <TableHead>Valódi tagok</TableHead>
                    <TableHead>Generált</TableHead>
                    <TableHead>Ismeretlen</TableHead>
                    <TableHead>Összesen</TableHead>
                    <TableHead>Létrehozva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.hubs.map((hub) => (
                    <TableRow
                      key={hub.id}
                      className="cursor-pointer hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      tabIndex={0}
                      onClick={() => openHub(hub)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openHub(hub);
                        }
                      }}
                      aria-label={`${hub.hobby_category} Hub részletei`}
                    >
                      <TableCell className="font-medium">{hub.hobby_category}</TableCell>
                      <TableCell>{hub.city || 'Nincs városadat'}</TableCell>
                      <TableCell><Badge variant="outline">{hub.real_member_count ?? 0} fő</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{hub.simulated_member_count ?? 0} fő</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{hub.unknown_origin_member_count ?? 0} fő</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{hub.member_count} fő</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(hub.created_at).toLocaleDateString('hu-HU')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <HubDetailModal
        hub={selectedHub}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onUpdated={model.loadHubs}
        onViewMember={(userId) => { void model.openUserDetailById(userId); }}
      />
    </>
  );
}
