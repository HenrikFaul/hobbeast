import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const DELETION_REASONS = [
  { value: 'not_useful', label: 'Nem találom hasznosnak az alkalmazást' },
  { value: 'too_complicated', label: 'Túl bonyolult a használata' },
  { value: 'privacy', label: 'Adatvédelmi okokból' },
  { value: 'alternative', label: 'Másik alkalmazásra váltok' },
  { value: 'temporary', label: 'Csak ideiglenesen használtam' },
  { value: 'bugs', label: 'Túl sok hibát tapasztaltam' },
  { value: 'other', label: 'Egyéb' },
];

export function DeleteAccountCard() {
  const { user } = useAuth();
  const [step, setStep] = useState<'closed' | 'reason' | 'confirm'>('closed');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const reasonLabel = DELETION_REASONS.find(r => r.value === selectedReason)?.label;
  const finalReason = selectedReason === 'other' ? `Egyéb: ${customReason}` : reasonLabel || '';
  const canProceed = selectedReason && (selectedReason !== 'other' || customReason.trim().length > 0);

  const handleClose = () => {
    setStep('closed');
    setSelectedReason('');
    setCustomReason('');
  };

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { reason: finalReason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/auth');
    } catch (err) {
      console.error('Delete account error:', err);
      toast.error('Hiba történt a fiók törlésekor. Kérjük, próbáld újra.');
      setDeleting(false);
      handleClose();
    }
  };

  return (
    <>
      <Card className="rounded-2xl shadow-card border border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 font-display text-destructive">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            Fiók törlése
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A fiókod végleges törlése nem visszavonható. Minden adatod, eseményed és profilod törlődni fog.
          </p>
          <Button variant="destructive" className="w-full rounded-xl h-11 font-semibold" onClick={() => setStep('reason')}>
            <Trash2 className="mr-2 h-4 w-4" />
            Fiók törlése
          </Button>
        </CardContent>
      </Card>

      <Dialog open={step === 'reason'} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Miért szeretnéd törölni a fiókodat?
            </DialogTitle>
            <DialogDescription className="text-sm">
              Kérjük, válaszd ki a törlés okát, mielőtt továbblépnél.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Törlés oka</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Válassz egy okot..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {DELETION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value} className="rounded-lg">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedReason === 'other' && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kérjük, írd le az okot</Label>
                <Textarea value={customReason} onChange={e => setCustomReason(e.target.value)} placeholder="Írd le, miért szeretnéd törölni a fiókodat..." className="rounded-xl resize-none" rows={3} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={handleClose}>Mégsem</Button>
            <Button variant="destructive" className="rounded-xl font-semibold" disabled={!canProceed} onClick={() => setStep('confirm')}>Tovább</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={step === 'confirm'} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">Biztosan törölni szeretnéd a fiókodat?</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm leading-relaxed space-y-3 pt-2">
                <p>Sajnáljuk, hogy így döntöttél! 😔</p>
                <p>A törlés végleges és nem visszavonható. Az alábbi adatok véglegesen törlődnek:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>A profilod és minden személyes adatod</li>
                  <li>Az általad létrehozott események</li>
                  <li>Esemény-részvételeid</li>
                  <li>Feltöltött fényképeid</li>
                </ul>
                <p className="font-medium text-foreground">Törlés oka: {finalReason}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" disabled={deleting} onClick={handleClose}>Mégsem</Button>
            <Button variant="destructive" className="rounded-xl font-semibold" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Törlés folyamatban...' : 'Véglegesen törlöm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
