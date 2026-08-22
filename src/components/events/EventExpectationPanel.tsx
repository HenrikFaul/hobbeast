import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface EventExpectationData {
  meetingInstructions?: string | null;
  maxAttendees?: number | null;
  beginnerFriendly?: boolean | null;
  activityIntensity?: string | null;
  equipmentRequired?: string | null;
  accessibilityInfo?: string | null;
  costDetails?: string | null;
  expectedEndAt?: string | null;
  hostName?: string | null;
  cancellationPolicy?: string | null;
}

function formatExpectedEnd(value: NonNullable<EventExpectationData[keyof EventExpectationData]>) {
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('hu-HU');
}

const EXPECTATION_FIELDS: Array<{
  key: keyof EventExpectationData;
  label: string;
  format?: (value: NonNullable<EventExpectationData[keyof EventExpectationData]>) => string;
}> = [
  { key: 'meetingInstructions', label: 'Találkozás' },
  { key: 'maxAttendees', label: 'Várható maximális csoportméret', format: (value) => `${value} fő` },
  { key: 'beginnerFriendly', label: 'Kezdőbarát', format: (value) => value ? 'Igen' : 'Nem' },
  { key: 'activityIntensity', label: 'Aktivitási intenzitás' },
  { key: 'equipmentRequired', label: 'Szükséges felszerelés' },
  { key: 'accessibilityInfo', label: 'Hozzáférhetőség' },
  { key: 'costDetails', label: 'Költség és ami beletartozik' },
  { key: 'expectedEndAt', label: 'Várható befejezés', format: formatExpectedEnd },
  { key: 'hostName', label: 'Host' },
  { key: 'cancellationPolicy', label: 'Lemondási szabály' },
];

export function EventExpectationPanel({ data, isOrganizer = false }: { data: EventExpectationData; isOrganizer?: boolean }) {
  const available = EXPECTATION_FIELDS.filter((field) => data[field.key] !== null && data[field.key] !== undefined && data[field.key] !== '');
  const missing = EXPECTATION_FIELDS.filter((field) => !available.includes(field));

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Mire számíthatsz?</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {available.map((field) => {
          const value = data[field.key];
          const rendered = field.format && value !== null && value !== undefined ? field.format(value) : String(value);
          return (
            <div key={field.key} className="flex items-start gap-3 rounded-xl border p-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{field.label}</div><div className="text-sm">{rendered}</div></div>
            </div>
          );
        })}
        {available.length === 0 && <p className="text-sm text-muted-foreground">A host még nem adott meg strukturált felkészülési információt.</p>}
        {isOrganizer && missing.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="mb-2 flex items-center gap-2 font-medium"><CircleDashed className="h-4 w-4" />Host feladatok</div>
            <ul className="list-disc space-y-1 pl-5">{missing.map((field) => <li key={field.key}>{field.label}</li>)}</ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
