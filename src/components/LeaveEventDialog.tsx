import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock, AlertTriangle } from "lucide-react";

interface LeaveEventDialogProps {
  eventTitle: string;
  eventDate: string;
  eventTime: string | null;
  eventLocation: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LeaveEventDialog({ eventTitle, eventDate, eventTime, eventLocation, onConfirm, onCancel }: LeaveEventDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="font-display text-lg font-bold">Kiiratkozás</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Biztosan ki szeretnél iratkozni ebből a programból?
        </p>

        <div className="rounded-xl bg-muted/50 p-4 space-y-2 mb-5">
          <p className="font-semibold text-sm">{eventTitle}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{eventDate}</span>
            {eventTime && (
              <>
                <Clock className="h-3.5 w-3.5 ml-1" />
                <span>{eventTime}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{eventLocation}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>
            Mégsem
          </Button>
          <Button variant="destructive" className="flex-1 rounded-xl" onClick={onConfirm}>
            Kiiratkozom
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
