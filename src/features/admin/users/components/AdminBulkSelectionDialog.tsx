import { Filter, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BulkFilters } from '../domain';
import type { AdminUsersController } from '../useAdminUsersController';

interface AdminBulkSelectionDialogProps {
  model: AdminUsersController['bulk'];
}

export function AdminBulkSelectionDialog({ model }: AdminBulkSelectionDialogProps) {
  const updateFilter = <Key extends keyof BulkFilters>(key: Key, value: BulkFilters[Key]) => {
    model.setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={model.modalOpen} onOpenChange={model.setModalOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> Tömeges kijelölés szűrőkkel
          </DialogTitle>
          <DialogDescription>
            Szűrj felhasználótípus, aktivitás és eseménygazda státusz alapján, majd jelöld ki a találatokat tömeges művelethez.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-user-type">Felhasználó típusa</Label>
              <Select
                value={model.filters.userType}
                onValueChange={(value) => updateFilter('userType', value as BulkFilters['userType'])}
              >
                <SelectTrigger id="bulk-user-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mindegy</SelectItem>
                  <SelectItem value="real">Igazi user</SelectItem>
                  <SelectItem value="generated">Generált user</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-open-owned-events">Van-e nyitott eseménye, aminek ő a gazdája</Label>
              <Select
                value={model.filters.hasOpenOwnedEvents}
                onValueChange={(value) => updateFilter('hasOpenOwnedEvents', value as BulkFilters['hasOpenOwnedEvents'])}
              >
                <SelectTrigger id="bulk-open-owned-events"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mindegy</SelectItem>
                  <SelectItem value="yes">Igen</SelectItem>
                  <SelectItem value="no">Nem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-registration-age">Regisztráció óta eltelt napok</Label>
              <Input
                id="bulk-registration-age"
                type="number"
                min={0}
                value={model.filters.registeredOlderThanDays}
                onChange={(event) => updateFilter('registeredOlderThanDays', event.target.value)}
                placeholder="pl. 40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-inactive-days">Utolsó belépés óta eltelt napok</Label>
              <Input
                id="bulk-inactive-days"
                type="number"
                min={0}
                value={model.filters.inactiveDays}
                onChange={(event) => updateFilter('inactiveDays', event.target.value)}
                placeholder="pl. 40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-hobby-filter">Hobbi tartalmaz</Label>
              <Input
                id="bulk-hobby-filter"
                value={model.filters.hobbyFilter}
                onChange={(event) => updateFilter('hobbyFilter', event.target.value)}
                placeholder="pl. futás"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-hub-filter">Hub (város vagy érdeklődési kör)</Label>
              <Input
                id="bulk-hub-filter"
                value={model.filters.hubFilter}
                onChange={(event) => updateFilter('hubFilter', event.target.value)}
                placeholder="pl. Budapest"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-search-reason">Hozzáférési/műveleti indok</Label>
            <Textarea
              id="bulk-search-reason"
              value={model.reason}
              onChange={(event) => model.setReason(event.target.value.slice(0, 1000))}
              placeholder="Kötelező audit-indok a szerveroldali kereséshez és a művelethez."
              maxLength={1000}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-xl gap-2" disabled={model.applying} onClick={() => void model.applySelection()}>
              <Filter className="h-4 w-4" /> Szűrés
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={model.resetFilters}>Szűrők törlése</Button>
            <Badge variant="secondary">Kijelölt profilok száma: {model.selectedCount}</Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
