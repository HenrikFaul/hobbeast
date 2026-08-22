import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setArrivalConfidence } from '@/lib/eventOperations';

interface ArrivalConfidenceCardProps {
  eventId: string;
  initialArrivingAlone?: boolean | null;
  initialFirstHobbeastEvent?: boolean | null;
}

function OptionalChoice({ label, value, onChange }: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={value === true ? 'default' : 'outline'} onClick={() => onChange(true)}>Igen</Button>
        <Button type="button" size="sm" variant={value === false ? 'default' : 'outline'} onClick={() => onChange(false)}>Nem</Button>
        <Button type="button" size="sm" variant={value === null ? 'secondary' : 'ghost'} onClick={() => onChange(null)}>Nem jelzem</Button>
      </div>
    </fieldset>
  );
}

export function ArrivalConfidenceCard({
  eventId,
  initialArrivingAlone = null,
  initialFirstHobbeastEvent = null,
}: ArrivalConfidenceCardProps) {
  const [arrivingAlone, setArrivingAlone] = useState<boolean | null>(initialArrivingAlone);
  const [firstHobbeastEvent, setFirstHobbeastEvent] = useState<boolean | null>(initialFirstHobbeastEvent);
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      await setArrivalConfidence({ eventId, arrivingAlone, firstHobbeastEvent });
      toast.success('Az érkezési jelzéseidet elmentettük.');
    } catch (error) {
      console.error(error);
      toast.error('Az érkezési jelzéseket most nem sikerült elmenteni.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Nyugodtabb első érkezés</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Ezek a jelzések opcionálisak, és csak az esemény hostja látja őket. Bármikor törölheted őket a „Nem jelzem” választással.
        </p>
        <OptionalChoice label="Egyedül érkezem" value={arrivingAlone} onChange={setArrivingAlone} />
        <OptionalChoice label="Ez lesz az első Hobbeast eseményem" value={firstHobbeastEvent} onChange={setFirstHobbeastEvent} />
        <Button type="button" disabled={pending} onClick={() => void save()}>{pending ? 'Mentés…' : 'Jelzések mentése'}</Button>
      </CardContent>
    </Card>
  );
}
