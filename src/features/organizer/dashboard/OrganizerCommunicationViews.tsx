import { AlertTriangle, Megaphone } from 'lucide-react';
import { OrganizerOperationsPanel } from '@/components/organizer/OrganizerOperationsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ReadinessItem } from '@/lib/eventLifecycle';
import type { OrganizerMessage, MessageAudience, MessageType } from '@/lib/organizer';
import type { HostReliabilityView } from '@/lib/organizerProduction';
import {
  MESSAGE_AUDIENCES,
  MESSAGE_TYPES,
  type OrganizerIncidentSeverity,
  type OrganizerIncidentType,
} from './contracts';
import { InfoPill } from './OrganizerStatCards';

interface OrganizerMessagesTabProps {
  messageType: MessageType;
  audienceFilter: MessageAudience;
  messageSubject: string;
  messageBody: string;
  scheduledFor: string;
  selectedParticipantCount: number;
  messagePending: boolean;
  messages: OrganizerMessage[];
  onMessageTypeChange: (value: MessageType) => void;
  onAudienceFilterChange: (value: MessageAudience) => void;
  onMessageSubjectChange: (value: string) => void;
  onMessageBodyChange: (value: string) => void;
  onScheduledForChange: (value: string) => void;
  onSendMessage: () => void;
}

export function OrganizerMessagesTab({
  messageType,
  audienceFilter,
  messageSubject,
  messageBody,
  scheduledFor,
  selectedParticipantCount,
  messagePending,
  messages,
  onMessageTypeChange,
  onAudienceFilterChange,
  onMessageSubjectChange,
  onMessageBodyChange,
  onScheduledForChange,
  onSendMessage,
}: OrganizerMessagesTabProps) {
  return (
    <TabsContent value="messages" className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="rounded-2xl border shadow-card">
        <CardHeader>
          <CardTitle>Event communications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Típus</Label>
              <Select value={messageType} onValueChange={(value) => onMessageTypeChange(value as MessageType)}>
                <SelectTrigger className="rounded-xl mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>{MESSAGE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Célközönség</Label>
              <Select value={audienceFilter} onValueChange={(value) => onAudienceFilterChange(value as MessageAudience)}>
                <SelectTrigger className="rounded-xl mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>{MESSAGE_AUDIENCES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Tárgy</Label>
            <Input value={messageSubject} onChange={(event) => onMessageSubjectChange(event.target.value)} className="rounded-xl mt-2" placeholder="Opcionális tárgy" />
          </div>
          <div>
            <Label>Üzenet</Label>
            <Textarea value={messageBody} onChange={(event) => onMessageBodyChange(event.target.value)} className="rounded-xl mt-2 min-h-[160px]" placeholder="Írd ide az üzenet tartalmát" />
          </div>
          <div>
            <Label>Ütemezés (opcionális)</Label>
            <Input type="datetime-local" value={scheduledFor} onChange={(event) => onScheduledForChange(event.target.value)} className="rounded-xl mt-2" />
          </div>
          {audienceFilter === 'selected' && <p className="text-xs text-muted-foreground">Az Attendees fülön kijelölt {selectedParticipantCount} résztvevő kapja meg.</p>}
          <Button disabled={messagePending || (audienceFilter === 'selected' && selectedParticipantCount === 0)} onClick={onSendMessage}><Megaphone className="h-4 w-4 mr-2" />{messagePending ? 'Mentés…' : 'Küldés / mentés'}</Button>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border shadow-card">
        <CardHeader>
          <CardTitle>Message history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{MESSAGE_TYPES.find((item) => item.value === message.message_type)?.label ?? message.message_type}</div>
                <Badge variant="outline">{message.delivery_state}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{MESSAGE_AUDIENCES.find((item) => item.value === message.audience_filter)?.label ?? message.audience_filter}</div>
              {message.subject && <div className="mt-2 font-medium">{message.subject}</div>}
              <p className="text-sm mt-2 whitespace-pre-wrap">{message.body}</p>
              <div className="text-xs text-muted-foreground mt-3">{new Date(message.created_at).toLocaleString('hu-HU')}</div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-muted-foreground">Még nincs kiküldött vagy ütemezett üzenet ehhez az eseményhez.</p>}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

interface OrganizerSettingsTabProps {
  selectedEventId: string | null;
  readinessItems: ReadinessItem[];
  legalTaxReady: boolean;
  readinessPending: boolean;
  reliability: HostReliabilityView;
  incidentType: OrganizerIncidentType;
  incidentSeverity: OrganizerIncidentSeverity;
  incidentSummary: string;
  incidentPending: boolean;
  onLegalTaxReadyChange: (value: boolean) => void;
  onSaveReadiness: () => void;
  onIncidentTypeChange: (value: OrganizerIncidentType) => void;
  onIncidentSeverityChange: (value: OrganizerIncidentSeverity) => void;
  onIncidentSummaryChange: (value: string) => void;
  onIncidentHandoff: () => void;
  onOperationsChanged: () => Promise<void>;
}

export function OrganizerSettingsTab({
  selectedEventId,
  readinessItems,
  legalTaxReady,
  readinessPending,
  reliability,
  incidentType,
  incidentSeverity,
  incidentSummary,
  incidentPending,
  onLegalTaxReadyChange,
  onSaveReadiness,
  onIncidentTypeChange,
  onIncidentSeverityChange,
  onIncidentSummaryChange,
  onIncidentHandoff,
  onOperationsChanged,
}: OrganizerSettingsTabProps) {
  return (
    <TabsContent value="settings" className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl border shadow-card">
        <CardHeader>
          <CardTitle>Organizer readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tanácsadó checklist; nem blokkolja a meglévő eseményedet. A hiányzó részleteket az eseményszerkesztőben pótolhatod.
          </p>
          <div className="space-y-2">
            {readinessItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="text-sm">{item.label}</span>
                <Badge variant={item.complete ? 'secondary' : 'outline'}>{item.complete ? 'kész' : 'hiányzik'}</Badge>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-xl border p-3">
            <Checkbox id="readiness-legal-tax" checked={legalTaxReady} onCheckedChange={(checked) => onLegalTaxReadyChange(checked === true)} />
            <Label htmlFor="readiness-legal-tax" className="cursor-pointer text-sm">Megerősítem, hogy az esemény jogi, adózási és esetleges engedélykötelezettségeit ellenőriztem.</Label>
          </div>
          <Button disabled={!selectedEventId || readinessPending} onClick={onSaveReadiness}>
            {readinessPending ? 'Mentés…' : 'Readiness pillanatkép mentése'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="rounded-2xl border shadow-card">
          <CardHeader><CardTitle>Belső host quality jelek</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoPill label="Completion" value={reliability.publishToCompletionRate === null ? 'n/a' : `${Math.round(reliability.publishToCompletionRate * 100)}%`} />
              <InfoPill label="Cancellation" value={reliability.cancellationRate === null ? 'n/a' : `${Math.round(reliability.cancellationRate * 100)}%`} />
              <InfoPill label="Attendance" value={reliability.attendanceRate === null ? 'n/a' : `${Math.round(reliability.attendanceRate * 100)}%`} />
              <InfoPill label="No-show" value={reliability.noShowRate === null ? 'n/a' : `${Math.round(reliability.noShowRate * 100)}%`} />
            </div>
            <p className="text-xs text-muted-foreground">Belső, magyarázható minőségjelzés; nem publikus és nem automatikus büntető score.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Incident handoff</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Típus</Label>
                <Select value={incidentType} onValueChange={(value) => onIncidentTypeChange(value as OrganizerIncidentType)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">Safety</SelectItem><SelectItem value="venue">Helyszín</SelectItem>
                    <SelectItem value="attendance">Attendance</SelectItem><SelectItem value="accessibility">Akadálymentesség</SelectItem>
                    <SelectItem value="other">Egyéb</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Súlyosság</Label>
                <Select value={incidentSeverity} onValueChange={(value) => onIncidentSeverityChange(value as OrganizerIncidentSeverity)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Alacsony</SelectItem><SelectItem value="medium">Közepes</SelectItem>
                    <SelectItem value="high">Magas</SelectItem><SelectItem value="critical">Kritikus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Minimális szükséges összefoglaló</Label>
              <Textarea value={incidentSummary} onChange={(event) => onIncidentSummaryChange(event.target.value)} maxLength={1000} className="mt-2 min-h-24" />
            </div>
            <Button disabled={!selectedEventId || incidentPending || incidentSummary.trim().length < 3} onClick={onIncidentHandoff}>
              {incidentPending ? 'Rögzítés…' : 'Incident átadása'}
            </Button>
          </CardContent>
        </Card>
      </div>
      <OrganizerOperationsPanel eventId={selectedEventId} onChanged={onOperationsChanged} />
    </TabsContent>
  );
}

