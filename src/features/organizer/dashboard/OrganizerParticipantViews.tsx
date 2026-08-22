import type { Dispatch, SetStateAction } from 'react';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { OrganizerParticipant, ParticipationAuditEntry, ParticipationStatus } from '@/lib/organizer';
import {
  getParticipationStatusBadgeVariant,
  getParticipationStatusLabel,
  PARTICIPATION_FILTERS,
} from './contracts';

type ParticipantTransitionHandler = (participant: OrganizerParticipant, nextStatus: ParticipationStatus) => void;

interface OrganizerAttendeesTabProps {
  participants: OrganizerParticipant[];
  participantSearch: string;
  participantFilter: ParticipationStatus | 'all';
  selectedParticipantIds: Set<string>;
  bulkStatus: ParticipationStatus;
  bulkPending: boolean;
  queuedCheckInIds: Set<string>;
  transitioningIds: Set<string>;
  onParticipantSearchChange: (value: string) => void;
  onParticipantFilterChange: (value: ParticipationStatus | 'all') => void;
  onSelectedParticipantIdsChange: Dispatch<SetStateAction<Set<string>>>;
  onBulkStatusChange: (value: ParticipationStatus) => void;
  onExportCsv: () => void;
  onBulkTransition: () => void;
  onTransition: ParticipantTransitionHandler;
  onOpenParticipant: (participant: OrganizerParticipant) => void;
}

export function OrganizerAttendeesTab({
  participants,
  participantSearch,
  participantFilter,
  selectedParticipantIds,
  bulkStatus,
  bulkPending,
  queuedCheckInIds,
  transitioningIds,
  onParticipantSearchChange,
  onParticipantFilterChange,
  onSelectedParticipantIdsChange,
  onBulkStatusChange,
  onExportCsv,
  onBulkTransition,
  onTransition,
  onOpenParticipant,
}: OrganizerAttendeesTabProps) {
  return (
    <TabsContent value="attendees" className="mt-4">
      <Card className="rounded-2xl border shadow-card">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Résztvevőkezelés</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={participantSearch} onChange={(event) => onParticipantSearchChange(event.target.value)} placeholder="Keresés név / invite code alapján" className="rounded-xl sm:w-64" />
            <Select value={participantFilter} onValueChange={(value) => onParticipantFilterChange(value as ParticipationStatus | 'all')}>
              <SelectTrigger className="rounded-xl sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARTICIPATION_FILTERS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={onExportCsv}><Download className="h-4 w-4 mr-2" />CSV export</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center" aria-label="Tömeges résztvevői művelet">
            <span className="text-sm font-medium">Kijelölve: {selectedParticipantIds.size}</span>
            <Select value={bulkStatus} onValueChange={(value) => onBulkStatusChange(value as ParticipationStatus)}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARTICIPATION_FILTERS.filter((item) => item.value !== 'all' && ['going', 'waitlist', 'cancelled', 'no_show', 'completed'].includes(item.value)).map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={bulkPending || selectedParticipantIds.size === 0} onClick={onBulkTransition}>
              {bulkPending ? 'Feldolgozás…' : 'Biztonságos bulk módosítás'}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Minden látható résztvevő kijelölése"
                    checked={participants.length > 0 && participants.every((participant) => selectedParticipantIds.has(participant.id))}
                    onCheckedChange={(checked) => onSelectedParticipantIdsChange(
                      checked ? new Set(participants.map((participant) => participant.id)) : new Set(),
                    )}
                  />
                </TableHead>
                <TableHead>Név</TableHead>
                <TableHead>Állapot</TableHead>
                <TableHead>Csatlakozott</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Invite code</TableHead>
                <TableHead className="text-right">Műveletek</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`${participant.profiles?.display_name ?? participant.user_id.slice(0, 8)} kijelölése`}
                      checked={selectedParticipantIds.has(participant.id)}
                      onCheckedChange={(checked) => onSelectedParticipantIdsChange((current) => {
                        const next = new Set(current);
                        if (checked) next.add(participant.id);
                        else next.delete(participant.id);
                        return next;
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{participant.profiles?.city ?? '—'}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {participant.arriving_alone === true && <Badge variant="outline">egyedül érkezik</Badge>}
                        {participant.first_hobbeast_event === true && <Badge variant="outline">első Hobbeast esemény</Badge>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getParticipationStatusBadgeVariant(participant.status)}>{getParticipationStatusLabel(participant.status)}</Badge>
                    {queuedCheckInIds.has(participant.id) && <Badge className="ml-2" variant="outline">offline sorban</Badge>}
                  </TableCell>
                  <TableCell>{new Date(participant.joined_at).toLocaleString('hu-HU')}</TableCell>
                  <TableCell>{participant.checked_in_at ? new Date(participant.checked_in_at).toLocaleString('hu-HU') : '—'}</TableCell>
                  <TableCell>{participant.invite_code ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2 flex-wrap">
                      {participant.status === 'waitlist' && <Button disabled={transitioningIds.has(participant.id)} size="sm" variant="outline" onClick={() => onTransition(participant, 'going')}>Promote</Button>}
                      {participant.status === 'going' && <Button disabled={transitioningIds.has(participant.id)} size="sm" variant="outline" onClick={() => onTransition(participant, 'checked_in')}>Check-in</Button>}
                      {participant.status === 'checked_in' && <Button disabled={transitioningIds.has(participant.id)} size="sm" variant="outline" onClick={() => onTransition(participant, 'going')}>Undo</Button>}
                      {participant.status !== 'cancelled' && participant.status !== 'completed' && <Button disabled={transitioningIds.has(participant.id)} size="sm" variant="outline" onClick={() => onTransition(participant, 'cancelled')}>Cancel</Button>}
                      <Button size="sm" onClick={() => onOpenParticipant(participant)}>Open</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {participants.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nincs találat a kiválasztott szűrőkre.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

interface OrganizerCheckInTabProps {
  candidates: OrganizerParticipant[];
  checkInSearch: string;
  inviteCode: string;
  queuedCheckInIds: Set<string>;
  transitioningIds: Set<string>;
  onCheckInSearchChange: (value: string) => void;
  onInviteCodeChange: (value: string) => void;
  onTransition: ParticipantTransitionHandler;
}

export function OrganizerCheckInTab({
  candidates,
  checkInSearch,
  inviteCode,
  queuedCheckInIds,
  transitioningIds,
  onCheckInSearchChange,
  onInviteCodeChange,
  onTransition,
}: OrganizerCheckInTabProps) {
  return (
    <TabsContent value="checkin" className="mt-4">
      <Card className="rounded-2xl border shadow-card">
        <CardHeader>
          <CardTitle>Check-in admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Keresés név szerint</Label>
              <Input value={checkInSearch} onChange={(event) => onCheckInSearchChange(event.target.value)} placeholder="John Doe" className="rounded-xl mt-2" />
            </div>
            <div>
              <Label>Invite code</Label>
              <Input value={inviteCode} onChange={(event) => onInviteCodeChange(event.target.value)} placeholder="ABC123" className="rounded-xl mt-2" />
            </div>
          </div>
          <div className="space-y-3">
            {candidates.map((participant) => (
              <div key={participant.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id.slice(0, 8)}</div>
                  <div className="text-sm text-muted-foreground">
                    {getParticipationStatusLabel(participant.status)} · invite code: {participant.invite_code ?? 'nincs'}
                    {queuedCheckInIds.has(participant.id) && ' · offline sorban'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {participant.status === 'going' && <Button disabled={transitioningIds.has(participant.id)} onClick={() => onTransition(participant, 'checked_in')}>Check in</Button>}
                  {participant.status === 'checked_in' && <Button disabled={transitioningIds.has(participant.id)} variant="outline" onClick={() => onTransition(participant, 'going')}>Undo</Button>}
                  {participant.status === 'waitlist' && <Button disabled={transitioningIds.has(participant.id)} variant="outline" onClick={() => onTransition(participant, 'going')}>Promote</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

interface OrganizerParticipantDetailSheetProps {
  participant: OrganizerParticipant | null;
  participantAudit: ParticipationAuditEntry[];
  transitioningIds: Set<string>;
  onClose: () => void;
  onParticipantChange: (participant: OrganizerParticipant) => void;
  onTransition: ParticipantTransitionHandler;
  onSaveNote: () => void;
}

export function OrganizerParticipantDetailSheet({
  participant,
  participantAudit,
  transitioningIds,
  onClose,
  onParticipantChange,
  onTransition,
  onSaveNote,
}: OrganizerParticipantDetailSheetProps) {
  return (
    <Sheet open={!!participant} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {participant && (
          <>
            <SheetHeader>
              <SheetTitle>{participant.profiles?.display_name ?? participant.user_id.slice(0, 8)} – attendee workspace</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 mt-6">
              <Card className="rounded-2xl border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Állapot</div>
                      <Badge variant={getParticipationStatusBadgeVariant(participant.status)}>{getParticipationStatusLabel(participant.status)}</Badge>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>Csatlakozott: {new Date(participant.joined_at).toLocaleString('hu-HU')}</div>
                      <div>Check-in: {participant.checked_in_at ? new Date(participant.checked_in_at).toLocaleString('hu-HU') : '—'}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {(participant.arriving_alone !== null || participant.first_hobbeast_event !== null) && (
                <Card className="rounded-2xl border">
                  <CardHeader><CardTitle>Privát érkezési jelzések</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><div className="text-muted-foreground">Egyedül érkezik</div><div className="font-medium">{participant.arriving_alone === null ? 'Nincs jelzés' : participant.arriving_alone ? 'Igen' : 'Nem'}</div></div>
                    <div><div className="text-muted-foreground">Első Hobbeast esemény</div><div className="font-medium">{participant.first_hobbeast_event === null ? 'Nincs jelzés' : participant.first_hobbeast_event ? 'Igen' : 'Nem'}</div></div>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-2xl border">
                <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button disabled={transitioningIds.has(participant.id)} variant="outline" onClick={() => onTransition(participant, 'going')}>Promote / going</Button>
                  <Button disabled={transitioningIds.has(participant.id)} variant="outline" onClick={() => onTransition(participant, 'checked_in')}>Check-in</Button>
                  {participant.status === 'checked_in' && <Button disabled={transitioningIds.has(participant.id)} variant="outline" onClick={() => onTransition(participant, 'completed')}>Attendance véglegesítése</Button>}
                  <Button disabled={transitioningIds.has(participant.id) || participant.status === 'completed'} variant="outline" onClick={() => onTransition(participant, 'cancelled')}>Cancel</Button>
                  <Button disabled={transitioningIds.has(participant.id) || participant.status === 'completed'} variant="outline" onClick={() => onTransition(participant, 'no_show')}>Mark no-show</Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border">
                <CardHeader><CardTitle>Szervezői megjegyzés</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={participant.organizer_note ?? ''}
                    onChange={(event) => onParticipantChange({ ...participant, organizer_note: event.target.value })}
                    className="rounded-xl min-h-[120px]"
                  />
                  <Button onClick={onSaveNote}>Save note</Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border">
                <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {participantAudit.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3">
                      <div className="font-medium">{item.action}</div>
                      <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('hu-HU')}</div>
                    </div>
                  ))}
                  {participantAudit.length === 0 && <p className="text-sm text-muted-foreground">Még nincs audit előzmény ehhez a résztvevőhöz.</p>}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
