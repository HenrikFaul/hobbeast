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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AdminUsersController } from '../useAdminUsersController';

interface AdminBulkActionDialogProps {
  model: AdminUsersController['bulk'];
}

export function AdminBulkActionDialog({ model }: AdminBulkActionDialogProps) {
  const canSubmit = !model.applying
    && model.reason.trim().length >= 3
    && model.confirmation === model.expectedConfirmation
    && (model.pendingAction !== 'delete' || model.selectedGeneratedOnly);

  return (
    <AlertDialog
      open={model.pendingAction !== null}
      onOpenChange={(open) => { if (!open) model.closeAction(); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Biztosan végrehajtod a műveletet?</AlertDialogTitle>
          <AlertDialogDescription>
            A kijelölt profilokra auditált, idempotens job fut. Kijelölt profilok száma: {model.selectedCount}.
            {model.pendingAction === 'delete' && ' Törlés csak generált felhasználóknál, külön négy-szem jóváhagyással engedett és nem visszavonható.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-action-reason">Kötelező indok</Label>
            <Textarea
              id="bulk-action-reason"
              value={model.reason}
              onChange={(event) => model.setReason(event.target.value.slice(0, 1000))}
              maxLength={1000}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-confirmation">
              Írd be pontosan: <span className="font-mono">{model.expectedConfirmation}</span>
            </Label>
            <Input
              id="bulk-confirmation"
              value={model.confirmation}
              onChange={(event) => model.setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          {model.pendingAction === 'delete' && (
            <div className="space-y-1">
              <Label htmlFor="bulk-approval">Jóváhagyási kérés azonosítója</Label>
              <Input
                id="bulk-approval"
                value={model.approvalRequestId}
                onChange={(event) => model.setApprovalRequestId(event.target.value)}
                placeholder="Első futtatás létrehozza; másik operátor hagyja jóvá"
              />
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Mégse</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              if (model.pendingAction) void model.runAction(model.pendingAction);
            }}
            disabled={!canSubmit}
          >
            {model.applying
              ? 'Futtatás…'
              : model.pendingAction === 'delete' && !model.approvalRequestId
                ? 'Jóváhagyás kérése'
                : 'Művelet futtatása'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
