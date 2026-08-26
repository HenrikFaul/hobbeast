import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitClubRegistration, type ClubType } from '@/lib/clubOperations';

interface ClubRegistrationDialogProps {
  authenticated: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: 'Ehhez be kell jelentkezned.',
  FEATURE_DISABLED: 'A klubregisztráció épp szünetel.',
  INVALID_NAME: 'A klub neve túl rövid.',
  INVALID_TYPE: 'Válassz típust.',
  TOO_MANY_PENDING: 'Már három regisztrációd vár elbírálásra. Várd meg azokat.',
  USER_SUSPENDED: 'A fiókodra vonatkozó korlátozás miatt ez most nem elérhető.',
};

export function ClubRegistrationDialog({ authenticated, onClose, onSubmitted }: ClubRegistrationDialogProps) {
  const [form, setForm] = useState({
    name: '', sport: '', city: '', clubType: 'sport_club' as ClubType,
    postalCode: '', address: '', websiteUrl: '', contactEmail: '', contactPhone: '',
    trainingInfo: '', membershipInfo: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (form.name.trim().length < 2) { setError('A klub neve kötelező.'); return; }
    if (!form.city.trim()) { setError('A város megadása kötelező, e nélkül nem talál rá senki.'); return; }
    setSaving(true);
    setError(null);
    try {
      await submitClubRegistration({
        name: form.name.trim(),
        sport: form.sport.trim(),
        city: form.city.trim(),
        clubType: form.clubType,
        postalCode: form.postalCode.trim() || null,
        address: form.address.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        trainingInfo: form.trainingInfo.trim() || null,
        membershipInfo: form.membershipInfo.trim() || null,
        description: form.description.trim() || null,
      });
      toast.success('Köszönjük! A klub bekerült az elbírálási sorba.');
      onSubmitted();
    } catch (submitError) {
      const code = submitError instanceof Error ? submitError.message : '';
      setError(ERROR_TEXT[code] || 'A regisztrációt nem sikerült elküldeni. Próbáld újra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Klub regisztrálása</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-left">
              <p>
                Sportklub, csapat vagy hobbiklub. Az adatokat átnézzük, mielőtt megjelenik —
                általában egy munkanapon belül.
              </p>
              <p className="text-xs">
                A Hobbeast nem lesz a klub tagszervezője: az érdeklődőket elirányítjuk hozzátok,
                a felvételről és a tagdíjról ti döntötök.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {!authenticated ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            A klubregisztrációhoz be kell jelentkezned, hogy később tudd szerkeszteni az adatokat
            és lásd a jelentkezőket.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-name">A klub neve *</Label>
              <Input id="reg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-sport">Sportág vagy tevékenység</Label>
              <Input id="reg-sport" placeholder="pl. Karate, Evezés, Túra" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-type">Típus</Label>
              <select
                id="reg-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.clubType}
                onChange={(e) => setForm({ ...form, clubType: e.target.value as ClubType })}
              >
                <option value="sport_club">Sportklub / egyesület</option>
                <option value="team">Csapat</option>
                <option value="hobby_club">Hobbiklub</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-postal">Irányítószám</Label>
              <Input id="reg-postal" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-city">Város *</Label>
              <Input id="reg-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-address">Edzés helyszíne</Label>
              <Input id="reg-address" placeholder="utca, házszám" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-training">Edzésidők</Label>
              <Input id="reg-training" placeholder="pl. kedd és csütörtök 18:00–19:30" value={form.trainingInfo} onChange={(e) => setForm({ ...form, trainingInfo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-website">Honlap</Label>
              <Input id="reg-website" placeholder="https://…" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Kapcsolattartó e-mail</Label>
              <Input id="reg-email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-membership">Hogyan lehet csatlakozni?</Label>
              <Input id="reg-membership" placeholder="pl. az első edzés ingyenes, utána havi tagdíj" value={form.membershipInfo} onChange={(e) => setForm({ ...form, membershipInfo: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-description">Bemutatkozás</Label>
              <Textarea id="reg-description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Mégsem</Button>
          <Button onClick={() => void submit()} disabled={saving || !authenticated}>
            {saving ? 'Küldés…' : 'Beküldöm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
