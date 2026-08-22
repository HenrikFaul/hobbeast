import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type BeginnerFriendly = 'unspecified' | 'yes' | 'no';

interface CreateEventExpectationsFieldsProps {
  meetingInstructions: string;
  expectedEndTime: string;
  beginnerFriendly: BeginnerFriendly;
  activityIntensity: string;
  equipmentRequired: string;
  accessibilityInfo: string;
  costDetails: string;
  cancellationPolicy: string;
  waitlistEnabled: boolean;
  visibilityType: string;
  privateLocationRevealHours: string;
  onMeetingInstructionsChange: (value: string) => void;
  onExpectedEndTimeChange: (value: string) => void;
  onBeginnerFriendlyChange: (value: BeginnerFriendly) => void;
  onActivityIntensityChange: (value: string) => void;
  onEquipmentRequiredChange: (value: string) => void;
  onAccessibilityInfoChange: (value: string) => void;
  onCostDetailsChange: (value: string) => void;
  onCancellationPolicyChange: (value: string) => void;
  onWaitlistEnabledChange: (value: boolean) => void;
  onVisibilityTypeChange: (value: string) => void;
  onPrivateLocationRevealHoursChange: (value: string) => void;
}

export function CreateEventExpectationsFields(props: CreateEventExpectationsFieldsProps) {
  return (
    <section className="space-y-4 rounded-xl border p-4" aria-labelledby="create-event-expectations-title">
      <div>
        <h2 id="create-event-expectations-title" className="font-semibold">Mire számíthatnak a résztvevők?</h2>
        <p className="text-xs text-muted-foreground">A hiányzó mezők host feladatként jelennek meg; a rendszer nem talál ki helyetted információt.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="create-meeting-instructions">Találkozási instrukció</Label>
        <Textarea id="create-meeting-instructions" value={props.meetingInstructions} onChange={(event) => props.onMeetingInstructionsChange(event.target.value.slice(0, 1000))} maxLength={1000} placeholder="Hol és hogyan találjátok meg egymást?" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="create-expected-end">Várható befejezés</Label>
          <Input id="create-expected-end" type="time" value={props.expectedEndTime} onChange={(event) => props.onExpectedEndTimeChange(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-beginner-friendly">Kezdőbarát</Label>
          <Select value={props.beginnerFriendly} onValueChange={(value) => props.onBeginnerFriendlyChange(value as BeginnerFriendly)}>
            <SelectTrigger id="create-beginner-friendly"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="unspecified">Nincs megadva</SelectItem><SelectItem value="yes">Igen</SelectItem><SelectItem value="no">Nem</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-activity-intensity">Aktivitási intenzitás</Label>
          <Select value={props.activityIntensity || 'unspecified'} onValueChange={(value) => props.onActivityIntensityChange(value === 'unspecified' ? '' : value)}>
            <SelectTrigger id="create-activity-intensity"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="unspecified">Nincs megadva</SelectItem><SelectItem value="könnyű">Könnyű</SelectItem><SelectItem value="közepes">Közepes</SelectItem><SelectItem value="intenzív">Intenzív</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="create-equipment">Szükséges felszerelés</Label><Input id="create-equipment" value={props.equipmentRequired} onChange={(event) => props.onEquipmentRequiredChange(event.target.value.slice(0, 500))} maxLength={500} /></div>
        <div className="space-y-2"><Label htmlFor="create-accessibility">Hozzáférhetőség</Label><Input id="create-accessibility" value={props.accessibilityInfo} onChange={(event) => props.onAccessibilityInfoChange(event.target.value.slice(0, 500))} maxLength={500} /></div>
        <div className="space-y-2"><Label htmlFor="create-cost">Költség / mi tartozik bele</Label><Input id="create-cost" value={props.costDetails} onChange={(event) => props.onCostDetailsChange(event.target.value.slice(0, 500))} maxLength={500} /></div>
        <div className="space-y-2"><Label htmlFor="create-cancellation">Lemondási szabály</Label><Input id="create-cancellation" value={props.cancellationPolicy} onChange={(event) => props.onCancellationPolicyChange(event.target.value.slice(0, 500))} maxLength={500} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="create-waitlist">Várólista</Label>
          <Select value={props.waitlistEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => props.onWaitlistEnabledChange(value === 'enabled')}>
            <SelectTrigger id="create-waitlist"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="disabled">Kikapcsolva</SelectItem><SelectItem value="enabled">Automatikus várólista</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-visibility">Láthatóság</Label>
          <Select value={props.visibilityType} onValueChange={props.onVisibilityTypeChange}>
            <SelectTrigger id="create-visibility"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="public">Nyilvános</SelectItem><SelectItem value="members">Csak tagok</SelectItem><SelectItem value="private">Privát</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      {props.visibilityType !== 'public' && (
        <div className="space-y-2">
          <Label htmlFor="create-location-reveal">Pontos helyszín teljes felfedése (kezdés előtt, óra)</Label>
          <Input id="create-location-reveal" type="number" min={0} max={168} value={props.privateLocationRevealHours} onChange={(event) => props.onPrivateLocationRevealHoursChange(event.target.value)} />
        </div>
      )}
    </section>
  );
}
