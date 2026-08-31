import { useCallback, useEffect, useState } from 'react';
import { Ticket, Loader2, Plus, Check, ScanLine, Wallet, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import {
  checkInTicket,
  confirmOrderPayment,
  createTicketType,
  formatPrice,
  getEventTicketSummary,
  listEventPendingOrders,
  listTicketTypesAdmin,
  listTicketTypesPublic,
  reserveTickets,
  setTicketTypeActive,
  type PendingOrder,
  type ReserveResult,
  type TicketSummary,
  type TicketTypeAdmin,
  type TicketTypePublic,
} from '@/features/tickets/tickets';

/**
 * Ticketing on the event page (O-H). One component serves both audiences: any
 * visitor sees the ticket types and can reserve; a finance operator additionally
 * gets the management panel (create types, confirm transfers, check people in).
 * It renders nothing when the event has no tickets and the viewer is not an
 * operator, so it stays invisible on the vast majority of events.
 */

function ReserveRow({ type, onReserved }: { type: TicketTypePublic; onReserved: (r: ReserveResult) => void }) {
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const max = Math.max(1, Math.min(type.available, type.per_order_limit));

  const reserve = async () => {
    if (!user) { toast.error('Előbb jelentkezz be a foglaláshoz.'); return; }
    setBusy(true);
    const result = await reserveTickets(type.id, qty);
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    onReserved(result.result);
  };

  const soldOut = type.available <= 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {type.name}
          <span className="text-sm font-semibold text-primary">{formatPrice(type.price_cents, type.currency)}</span>
        </p>
        {type.description && <p className="text-xs text-muted-foreground">{type.description}</p>}
        <p className="text-xs text-muted-foreground">
          {soldOut ? 'Elfogyott' : `${type.available} szabad hely`}
          {!type.sales_open && ' · értékesítés zárva'}
        </p>
      </div>
      {!soldOut && type.sales_open && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`qty-${type.id}`}>Darabszám</label>
          <select
            id={`qty-${type.id}`}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Button size="sm" disabled={busy} onClick={() => void reserve()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : type.price_cents === 0 ? 'Jegy igénylése' : 'Foglalás'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReserveOutcome({ result, onClose }: { result: ReserveResult; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      {result.status === 'paid' ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Megvan a jegyed!
          </p>
          <ul className="mt-1 space-y-1">
            {result.tickets.map((code) => (
              <li key={code} className="font-mono text-sm">{code}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">A jegyeid a profilod „Jegyeim" részében is megjelennek.</p>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" /> Foglalás rögzítve — fizetésre vár
          </p>
          <p className="mt-1 text-sm">
            Fizetendő: <span className="font-semibold">{formatPrice(result.amount_cents, result.currency)}</span> ({result.quantity} db).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A szervező a fizetés beérkezése után igazolja a rendelést, és ekkor kapod meg a jegyet. A fizetés a
            szervezővel egyeztetett módon történik — a Hobbeast nem kezel bankkártyát.
          </p>
        </>
      )}
      <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={onClose}>Rendben</Button>
    </div>
  );
}

function OperatorPanel({ eventId, types, summary, pending, onChanged }: {
  eventId: string; types: TicketTypeAdmin[]; summary: TicketSummary | null;
  pending: PendingOrder[]; onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [priceHuf, setPriceHuf] = useState('0');
  const [qtyTotal, setQtyTotal] = useState('50');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');

  const create = async () => {
    setBusy(true);
    const result = await createTicketType({
      eventId, name, priceCents: Math.max(0, Math.round(Number(priceHuf) || 0) * 100),
      quantityTotal: Math.max(1, Math.round(Number(qtyTotal) || 0)),
    });
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    setName(''); setPriceHuf('0'); setQtyTotal('50'); setCreating(false);
    toast.success('Jegytípus létrehozva.');
    onChanged();
  };

  const toggle = async (id: string, active: boolean) => {
    if (!(await setTicketTypeActive(id, active))) { toast.error('A művelet nem sikerült.'); return; }
    onChanged();
  };

  const confirm = async (orderId: string) => {
    const result = await confirmOrderPayment(orderId, 'Kézi igazolás a szervezőtől');
    if (result.ok === false) { toast.error(result.message); return; }
    toast.success('Fizetés igazolva — a jegyek kiadva.');
    onChanged();
  };

  const doCheckIn = async () => {
    if (code.trim().length < 3) return;
    const result = await checkInTicket(code.trim());
    if (result.ok === false) { toast.error(result.message); return; }
    toast.success(result.already ? 'Ezt a jegyet már beléptették.' : `Beléptetve: ${result.eventTitle}`);
    setCode('');
    onChanged();
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-secondary/20 p-3">
      <p className="text-sm font-semibold">Jegykezelés (szervező)</p>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Eladott', summary.sold], ['Kiadott', summary.issued], ['Beléptetve', summary.checked_in],
            ['Bevétel', formatPrice(summary.revenue_cents)]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background/70 p-2 text-center">
              <p className="text-lg font-bold tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Ticket types */}
      <ul className="space-y-1.5">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{formatPrice(t.price_cents, t.currency)} · {t.quantity_sold}/{t.quantity_total}</span>
              {!t.is_active && <Badge variant="outline" className="rounded-full text-[10px]">inaktív</Badge>}
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void toggle(t.id, !t.is_active)}>
              {t.is_active ? 'Kikapcsol' : 'Bekapcsol'}
            </Button>
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jegytípus neve, pl. Elővételi" className="h-8 text-sm" />
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Ár (Ft, 0 = ingyenes)</Label>
              <Input value={priceHuf} onChange={(e) => setPriceHuf(e.target.value)} inputMode="numeric" className="mt-1 h-8 text-sm" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Darabszám</Label>
              <Input value={qtyTotal} onChange={(e) => setQtyTotal(e.target.value)} inputMode="numeric" className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || name.trim().length < 2} onClick={() => void create()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Létrehozás
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Mégse</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Új jegytípus
        </Button>
      )}

      {/* Pending transfers to confirm */}
      {pending.length > 0 && (
        <div className="space-y-1.5 border-t border-border/50 pt-2">
          <p className="text-xs font-medium text-muted-foreground">Fizetésre váró rendelések</p>
          {pending.map((o) => (
            <div key={o.order_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-sm">
              <span>
                <span className="font-medium">{formatPrice(o.amount_cents, o.currency)}</span>
                <span className="text-xs text-muted-foreground"> · {o.quantity} db {o.ticket_type} · {o.buyer_email ?? 'nincs e-mail'}</span>
              </span>
              <Button size="sm" className="h-7 text-xs" onClick={() => void confirm(o.order_id)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Fizetés igazolása
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Check-in */}
      <div className="flex items-center gap-2 border-t border-border/50 pt-2">
        <ScanLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Jegykód beléptetéshez (pl. HB-…)" className="h-8 flex-1 font-mono text-sm" />
        <Button size="sm" disabled={code.trim().length < 3} onClick={() => void doCheckIn()}>Beléptet</Button>
      </div>
    </div>
  );
}

export function EventTickets({ eventId }: { eventId: string }) {
  const [types, setTypes] = useState<TicketTypePublic[]>([]);
  const [adminTypes, setAdminTypes] = useState<TicketTypeAdmin[] | null>(null);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<ReserveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pub, adm] = await Promise.all([listTicketTypesPublic(eventId), listTicketTypesAdmin(eventId)]);
    setTypes(pub);
    setAdminTypes(adm);
    if (adm) {
      const [s, p] = await Promise.all([getEventTicketSummary(eventId), listEventPendingOrders(eventId)]);
      setSummary(s); setPending(p);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const isOperator = adminTypes !== null;
  if (loading) return null;
  if (types.length === 0 && !isOperator) return null;

  return (
    <Card className="rounded-2xl border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <Ticket className="h-5 w-5 text-primary" aria-hidden="true" /> Jegyek
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {outcome && <ReserveOutcome result={outcome} onClose={() => { setOutcome(null); void load(); }} />}

        {types.length > 0 ? (
          types.map((t) => <ReserveRow key={t.id} type={t} onReserved={setOutcome} />)
        ) : (
          isOperator && <p className="text-sm text-muted-foreground">Még nincs jegytípus — hozz létre egyet lentebb.</p>
        )}

        {isOperator && adminTypes && (
          <OperatorPanel eventId={eventId} types={adminTypes} summary={summary} pending={pending} onChanged={load} />
        )}
      </CardContent>
    </Card>
  );
}

export default EventTickets;
