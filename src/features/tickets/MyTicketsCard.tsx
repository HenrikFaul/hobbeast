import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Loader2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { myTickets, type MyTicket } from '@/features/tickets/tickets';

/**
 * "My tickets" (O-H) — the tickets a person holds, on their profile. Self-
 * effacing: someone who holds none never sees the card.
 */

const STATUS_LABEL: Record<MyTicket['status'], { label: string; variant: 'secondary' | 'default' | 'outline' }> = {
  issued: { label: 'Érvényes', variant: 'default' },
  checked_in: { label: 'Beléptetve', variant: 'secondary' },
  void: { label: 'Érvénytelen', variant: 'outline' },
};

export function MyTicketsCard() {
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void myTickets().then((t) => { setTickets(t); setLoading(false); });
  }, []);

  if (loading || tickets.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-5 w-5 text-primary" aria-hidden="true" /> Jegyeim
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">A megvásárolt és igényelt jegyeid, belépőkóddal.</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {tickets.map((ticket) => {
            const status = STATUS_LABEL[ticket.status];
            return (
              <li key={ticket.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3">
                <div className="min-w-0">
                  <Link to={`/events/${ticket.event_id}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                    {ticket.event_title} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ticket.event_date).toLocaleDateString('hu-HU')} · {ticket.ticket_type}
                  </p>
                  <p className="font-mono text-sm">{ticket.code}</p>
                </div>
                <Badge variant={status.variant} className="rounded-full text-[10px]">{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default MyTicketsCard;
