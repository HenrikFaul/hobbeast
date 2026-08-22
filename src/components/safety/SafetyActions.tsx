import { useMemo, useRef, useState } from 'react';
import { Ban, Flag, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  SAFETY_REASON_CODES,
  SAFETY_REASON_LABELS,
  requiresEmergencyGuidance,
  validateSafetyReportDraft,
  type SafetyReasonCode,
  type SafetyTargetType,
} from '@/lib/trustSafety';
import { createCorrelationId } from '@/lib/observability';

interface SafetyActionsProps {
  targetType: SafetyTargetType;
  targetRef: string;
  targetUserId?: string | null;
  sourceSurface: string;
  className?: string;
  onBlocked?: () => void;
}

interface ReportReceipt {
  reportId?: string;
  caseId?: string | null;
}

export function SafetyActions({
  targetType,
  targetRef,
  targetUserId,
  sourceSurface,
  className,
  onBlocked,
}: SafetyActionsProps) {
  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<SafetyReasonCode | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const idempotencyKey = useRef(createCorrelationId());

  const emergencyGuidance = useMemo(
    () => Boolean(reasonCode && requiresEmergencyGuidance(reasonCode)),
    [reasonCode],
  );

  const requireSession = () => {
    if (user) return true;
    toast.info('A safety művelethez előbb jelentkezz be.');
    return false;
  };

  const openReport = () => {
    if (!requireSession()) return;
    setReceipt(null);
    setReportOpen(true);
  };

  const submitReport = async () => {
    if (!user || !reasonCode) return;
    const validation = validateSafetyReportDraft({ targetType, targetRef, reasonCode, details });
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    setSubmitting(true);
    const correlationId = createCorrelationId();
    const { data, error } = await supabase.functions.invoke('trust-safety', {
      body: {
        action: 'submit_report',
        ...validation.value,
        targetUserId: targetUserId || null,
        sourceSurface,
        idempotencyKey: idempotencyKey.current,
      },
      headers: {
        'X-Correlation-ID': correlationId,
        'Idempotency-Key': idempotencyKey.current,
      },
    });
    setSubmitting(false);

    if (error || !data?.ok) {
      toast.error('A bejelentést most nem sikerült elküldeni. Próbáld újra később.');
      return;
    }

    setReceipt({ reportId: data.reportId, caseId: data.caseId });
    idempotencyKey.current = createCorrelationId();
    toast.success('A bejelentést bizalmasan rögzítettük.');
  };

  const blockUser = async () => {
    if (!user || !targetUserId) return;
    setBlocking(true);
    const correlationId = createCorrelationId();
    const { data, error } = await supabase.functions.invoke('trust-safety', {
      body: {
        action: 'block_user',
        targetUserId,
        reasonCode: reasonCode || 'privacy',
      },
      headers: {
        'X-Correlation-ID': correlationId,
        'Idempotency-Key': createCorrelationId(),
      },
    });
    setBlocking(false);
    if (error || !data?.ok) {
      toast.error('A tiltást most nem sikerült menteni.');
      return;
    }
    setBlockOpen(false);
    onBlocked?.();
    toast.success('A felhasználót letiltottad. Nem jelenik meg a közösségi ajánlásokban.');
  };

  return (
    <div className={className} aria-label="Biztonsági műveletek">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={openReport} className="text-muted-foreground">
          <Flag className="mr-1.5 h-4 w-4" aria-hidden="true" /> Jelentés
        </Button>
        {targetUserId && targetUserId !== user?.id && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => requireSession() && setBlockOpen(true)}
            className="text-muted-foreground"
          >
            <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" /> Tiltás
          </Button>
        )}
      </div>

      <Dialog open={reportOpen} onOpenChange={(open) => !submitting && setReportOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Biztonsági bejelentés</DialogTitle>
            <DialogDescription>
              Csak a szükséges információt add meg. A bejelentett fél nem látja, ki küldte a bejelentést.
            </DialogDescription>
          </DialogHeader>

          {receipt ? (
            <div role="status" aria-live="polite" className="space-y-3 py-2">
              <Alert>
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Bejelentés rögzítve</AlertTitle>
                <AlertDescription>
                  {receipt.caseId ? `Ügyazonosító: ${receipt.caseId}` : `Bejelentésazonosító: ${receipt.reportId}`}
                  . Nem ígérünk azonnali emberi válaszidőt; a súlyosság alapján kerül sorra.
                </AlertDescription>
              </Alert>
              <DialogFooter>
                <Button type="button" onClick={() => setReportOpen(false)}>Bezárás</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="safety-reason">Mi történt?</Label>
                  <Select value={reasonCode} onValueChange={(value) => setReasonCode(value as SafetyReasonCode)}>
                    <SelectTrigger id="safety-reason" aria-label="Bejelentés oka">
                      <SelectValue placeholder="Válassz okot" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAFETY_REASON_CODES.map((code) => (
                        <SelectItem key={code} value={code}>{SAFETY_REASON_LABELS[code]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="safety-details">Rövid leírás (opcionális)</Label>
                  <Textarea
                    id="safety-details"
                    value={details}
                    onChange={(event) => setDetails(event.target.value.slice(0, 1000))}
                    maxLength={1000}
                    rows={5}
                    placeholder="Tényekre és a releváns körülményekre szorítkozz."
                  />
                  <p className="text-right text-xs text-muted-foreground">{details.length}/1000</p>
                </div>
                {emergencyGuidance && (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Közvetlen veszély esetén</AlertTitle>
                    <AlertDescription>
                      Kérj azonnali segítséget a helyi segélyhívón vagy egy helyben elérhető szakembertől.
                      A Hobbeast nem sürgősségi szolgáltatás és nem végez klinikai értékelést.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReportOpen(false)} disabled={submitting}>
                  Mégse
                </Button>
                <Button type="button" onClick={submitReport} disabled={!reasonCode || submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Bejelentés küldése
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={blockOpen} onOpenChange={(open) => !blocking && setBlockOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Letiltod ezt a felhasználót?</AlertDialogTitle>
            <AlertDialogDescription>
              Mindkettőtök közösségi felfedezhetősége megszűnik egymás felé. Egy már közös esemény
              alapvető szervezői információi biztonságos, korlátozott formában továbbra is elérhetők lehetnek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blocking}>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void blockUser(); }} disabled={blocking}>
              {blocking && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Letiltás
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
