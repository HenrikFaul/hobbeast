import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitPostEventFeedback } from '@/lib/eventOperations';

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
        <Button type="button" size="sm" variant={value === null ? 'secondary' : 'ghost'} onClick={() => onChange(null)}>Nem válaszolok</Button>
      </div>
    </fieldset>
  );
}

export function PostEventFeedbackCard({ eventId }: { eventId: string }) {
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [feltSafe, setFeltSafe] = useState<boolean | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [privateNote, setPrivateNote] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
      await submitPostEventFeedback({
        eventId,
        descriptionAccuracy: accuracy,
        feltSafe,
        wouldReturn,
        privateNote,
      });
      setSaved(true);
      toast.success('Köszönjük, a privát esemény-visszajelzésedet elmentettük.');
    } catch (error) {
      console.error(error);
      toast.error('A visszajelzést most nem sikerült elmenteni.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Rövid esemény-visszajelzés</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">Opcionális és privát minőségjelzés az eseményről; nem személyértékelés.</p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mennyire felelt meg az esemény a leírásnak?</legend>
          <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((value) => <Button key={value} type="button" size="sm" aria-label={`${value} az 5-ből`} variant={accuracy === value ? 'default' : 'outline'} onClick={() => setAccuracy(value)}>{value}</Button>)}</div>
        </fieldset>
        <OptionalChoice label="Biztonságosnak érezted az eseményt?" value={feltSafe} onChange={setFeltSafe} />
        <OptionalChoice label="Visszatérnél hasonló programra?" value={wouldReturn} onChange={setWouldReturn} />
        <div><Label htmlFor={`post-event-note-${eventId}`}>Privát megjegyzés (opcionális)</Label><Textarea id={`post-event-note-${eventId}`} value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} maxLength={1000} className="mt-2" /></div>
        <Button disabled={pending} onClick={() => void submit()}>{pending ? 'Mentés…' : saved ? 'Visszajelzés frissítése' : 'Visszajelzés mentése'}</Button>
      </CardContent>
    </Card>
  );
}
