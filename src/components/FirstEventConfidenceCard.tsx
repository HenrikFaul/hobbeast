import { useCallback, useEffect, useState } from 'react';
import { HeartHandshake, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildFirstEventConfidencePayload,
  FIRST_EVENT_FORMAT_OPTIONS,
  firstEventConfidenceVisibilityLabel,
  normalizeFirstEventFormats,
  type FirstEventConfidenceDraft,
  type FirstEventConfidenceVisibility,
  type FirstEventFormat,
} from '@/features/identity/firstEventConfidence';
import {
  loadMyFirstEventConfidence,
  saveMyFirstEventConfidence,
} from '@/features/identity/privacyRuntimeRepository';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const EMPTY_DRAFT: FirstEventConfidenceDraft = {
  preferredEventFormats: [],
  beginnerFriendly: null,
  soloArrivalComfort: 'no_preference',
  preferredGroupSize: 'no_preference',
  accessibilityNeeds: '',
  communicationPreference: 'in_app',
  visibility: 'private',
};

export function FirstEventConfidenceCard() {
  const [draft, setDraft] = useState<FirstEventConfidenceDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState<'save' | 'clear' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const result = await loadMyFirstEventConfidence();
    if (result.error || !result.data) {
      setError(true);
    } else {
      setDraft({
        preferredEventFormats: normalizeFirstEventFormats(result.data.preferred_event_formats || []),
        beginnerFriendly: result.data.beginner_friendly,
        soloArrivalComfort: result.data.solo_arrival_comfort || 'no_preference',
        preferredGroupSize: result.data.preferred_group_size || 'no_preference',
        accessibilityNeeds: result.data.accessibility_needs || '',
        communicationPreference: result.data.communication_preference || 'in_app',
        visibility: result.data.visibility || 'private',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFormat = (format: FirstEventFormat) => {
    setDraft((current) => ({
      ...current,
      preferredEventFormats: current.preferredEventFormats.includes(format)
        ? current.preferredEventFormats.filter((item) => item !== format)
        : normalizeFirstEventFormats([...current.preferredEventFormats, format]),
    }));
  };

  const save = async () => {
    setWorking('save');
    const result = await saveMyFirstEventConfidence(buildFirstEventConfidencePayload(draft));
    if (result.error) toast.error('Az első esemény preferenciái nem menthetők most.');
    else toast.success(result.data?.idempotent_replay ? 'A beállítások már naprakészek.' : 'Az első esemény preferenciáit elmentettük.');
    setWorking(null);
  };

  const clear = async () => {
    setWorking('clear');
    const result = await saveMyFirstEventConfidence({}, true);
    if (result.error) toast.error('A preferenciák törlése sikertelen.');
    else {
      setDraft(EMPTY_DRAFT);
      toast.success('Az opcionális első esemény preferenciákat töröltük.');
    }
    setWorking(null);
  };

  return (
    <Card className="rounded-2xl shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <HeartHandshake className="h-5 w-5 text-primary" />
          </span>
          Első esemény magabiztosan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />Beállítások betöltése…
          </div>
        ) : error ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-destructive">A privát részvételi preferenciák most nem tölthetők be.</p>
            <Button type="button" variant="outline" onClick={() => void load()}>Újrapróbálom</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Minden mező opcionális. Nem készítünk érzékeny profilt, és bármikor törölheted ezeket az adatokat.</p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Milyen első alkalom segítene?</legend>
              <div className="flex flex-wrap gap-2">
                {FIRST_EVENT_FORMAT_OPTIONS.map((option) => {
                  const selected = draft.preferredEventFormats.includes(option.value);
                  return <Button key={option.value} type="button" size="sm" variant={selected ? 'default' : 'outline'} aria-pressed={selected} onClick={() => toggleFormat(option.value)}>{option.label}</Button>;
                })}
              </div>
            </fieldset>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
              <span>Kezdőbarát események előre sorolása</span>
              <Switch checked={draft.beginnerFriendly === true} onCheckedChange={(checked) => setDraft((current) => ({ ...current, beginnerFriendly: checked }))} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Egyedül érkezés</Label>
                <Select value={draft.soloArrivalComfort} onValueChange={(value: FirstEventConfidenceDraft['soloArrivalComfort']) => setDraft((current) => ({ ...current, soloArrivalComfort: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no_preference">Nem adom meg</SelectItem><SelectItem value="prefer_buddy">Jól jönne egy buddy</SelectItem><SelectItem value="comfortable">Kényelmesen érkezem egyedül</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label>Preferált csoportméret</Label>
                <Select value={draft.preferredGroupSize} onValueChange={(value: FirstEventConfidenceDraft['preferredGroupSize']) => setDraft((current) => ({ ...current, preferredGroupSize: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no_preference">Nem adom meg</SelectItem><SelectItem value="small">Kicsi</SelectItem><SelectItem value="medium">Közepes</SelectItem><SelectItem value="large">Nagyobb</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="first-event-accessibility">Hozzáférhetőségi igény</Label><Textarea id="first-event-accessibility" value={draft.accessibilityNeeds} onChange={(event) => setDraft((current) => ({ ...current, accessibilityNeeds: event.target.value.slice(0, 500) }))} maxLength={500} placeholder="Csak a részvételhez szükséges információt add meg." /></div>
            <div className="space-y-2">
              <Label>Láthatóság</Label>
              <Select value={draft.visibility} onValueChange={(value: FirstEventConfidenceVisibility) => setDraft((current) => ({ ...current, visibility: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Privát</SelectItem><SelectItem value="event_host_after_join">Csatlakozás után az esemény hostja</SelectItem></SelectContent></Select>
              <p className="text-xs text-muted-foreground">{firstEventConfidenceVisibilityLabel(draft.visibility)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="flex-1" disabled={working !== null} onClick={() => void save()}>{working === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Mentés</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={working !== null}><RotateCcw className="mr-2 h-4 w-4" />Opcionális adatok törlése</Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Törlöd az első esemény preferenciákat?</AlertDialogTitle><AlertDialogDescription>A beállítások azonnal törlődnek. Később bármikor újra megadhatod őket.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Mégsem</AlertDialogCancel><AlertDialogAction onClick={() => void clear()}>Törlés</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
