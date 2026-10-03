import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Timer, Truck } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GHS, fmtDate } from "@/lib/naflis/format";
import { DELIVERY_RULE_LABEL } from "@/lib/naflis/purchase";
import { useNaflis, type InstallmentPlan, type Reservation } from "@/lib/naflis/store";
import { formatCountdown, useNow } from "@/components/naflis/PurchaseOptions";
import {
  describePaymentError,
  payPlanEntry,
  payReservationBalance,
  paymentMode,
  type PaymentMethod,
} from "@/services/walletService";

function MethodPicker({ value, onChange, disabled }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void; disabled?: boolean }) {
  return (
    <select
      aria-label="Pay with"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PaymentMethod)}
      className="rounded-md border bg-background px-2 py-1.5 text-xs"
    >
      <option value="wallet">NAFLIS Wallet</option>
      <option value="card">Card</option>
      <option value="momo">Mobile Money</option>
    </select>
  );
}

/** The buyer's installment and credit plans with a full ledger and pay-next action. */
export function MyPlans({ kind }: { kind?: InstallmentPlan["kind"] }) {
  const plans = useNaflis(
    useShallow((s) =>
      s.installments.filter((p) => p.buyerId === s.currentUserId && (!kind || p.kind === kind) && p.status !== "cancelled"),
    ),
  );
  if (plans.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{kind === "credit" ? "My credit plans" : "My payment plans"}</h2>
      {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
    </section>
  );
}

function PlanCard({ plan }: { plan: InstallmentPlan }) {
  const product = useNaflis((s) => s.products.find((x) => x.id === plan.productId));
  const order = useNaflis((s) => s.orders.find((o) => o.id === plan.orderId));
  const [method, setMethod] = useState<PaymentMethod>("wallet");
  const [paying, setPaying] = useState(false);
  const now = useNow(60_000);
  const next = plan.schedule.find((e) => !e.paid);
  const progress = plan.total ? Math.round((plan.paid / plan.total) * 100) : 0;

  const payNext = async () => {
    if (!next || paying) return;
    setPaying(true);
    try {
      const out = await payPlanEntry({ planId: plan.id, seq: next.seq, method });
      toast.success(out.message);
    } catch (err) {
      toast.error(describePaymentError(err).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {product && <img src={product.image} alt="" className="h-12 w-12 rounded object-cover" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{product?.name ?? "Item"}</p>
            <p className="text-xs text-muted-foreground">
              {plan.kind === "credit" ? "Credit sale" : "Installments"} · order{" "}
              <Link to="/buyer/orders/$orderId" params={{ orderId: plan.orderId }} className="text-sky-500 hover:underline">
                #{plan.orderId.slice(2, 10)}
              </Link>
            </p>
          </div>
        </div>
        <Badge variant={plan.status === "late" ? "destructive" : plan.status === "completed" ? "default" : "secondary"} className="capitalize">
          {plan.status}
        </Badge>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{GHS(plan.paid)} of {GHS(plan.total)} paid</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-sky-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">#</th>
              <th className="px-2.5 py-1.5 font-medium">Due</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.schedule.map((e) => {
              const overdue = !e.paid && e.graceUntil < now;
              return (
                <tr key={e.seq} className="border-t">
                  <td className="px-2.5 py-1.5">{e.kind === "deposit" ? "Deposit" : e.seq}</td>
                  <td className="px-2.5 py-1.5">{fmtDate(e.due)}</td>
                  <td className="px-2.5 py-1.5 text-right">{GHS(e.amount)}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    {e.paid ? (
                      <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> Paid{e.late ? " (late)" : ""}</span>
                    ) : overdue ? (
                      <span className="inline-flex items-center gap-1 text-error"><AlertTriangle className="h-3 w-3" /> Overdue</span>
                    ) : (
                      <span className="text-muted-foreground">Due</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {plan.kind === "installment" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="h-3.5 w-3.5 text-sky-500" />
          {DELIVERY_RULE_LABEL[plan.deliveryRule]} ·{" "}
          {order?.deliveryUnlocked === false ? "not yet unlocked" : "delivery unlocked"}
        </p>
      )}

      {next && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {next.graceUntil < now && plan.lateFeePct > 0 && (
            <span className="mr-auto text-xs text-error">+{plan.lateFeePct}% late fee applies</span>
          )}
          <MethodPicker value={method} onChange={setMethod} disabled={paying} />
          <Button size="sm" onClick={payNext} disabled={paying}>
            {paying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Pay {GHS(next.amount)} now
          </Button>
        </div>
      )}
    </div>
  );
}

/** The buyer's reservations with live countdowns. */
export function MyReservations() {
  const reservations = useNaflis(useShallow((s) => s.reservations.filter((r) => r.buyerId === s.currentUserId)));
  if (reservations.length === 0) return null;
  const sorted = [...reservations].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.createdAt - a.createdAt);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">My reservations</h2>
      {sorted.map((r) => <ReservationCard key={r.id} reservation={r} />)}
    </section>
  );
}

function ReservationCard({ reservation: r }: { reservation: Reservation }) {
  const product = useNaflis((s) => s.products.find((p) => p.id === r.productId));
  const order = useNaflis((s) => s.orders.find((o) => o.id === r.orderId));
  const cancelReservation = useNaflis((s) => s.cancelReservation);
  const runSchedulers = useNaflis((s) => s.runSchedulers);
  const now = useNow(1000);
  const [method, setMethod] = useState<PaymentMethod>("wallet");
  const [paying, setPaying] = useState(false);
  const remaining = r.expiresAt - now;
  const active = r.status === "active";

  const lapsed = active && remaining <= 0 && r.autoExpire && !order?.serverBacked;
  useEffect(() => {
    if (lapsed) runSchedulers(); // lapsed while the page was open
  }, [lapsed, runSchedulers]);

  const complete = async () => {
    setPaying(true);
    try {
      const out = await payReservationBalance({ reservationId: r.id, method });
      toast.success(out.message);
    } catch (err) {
      toast.error(describePaymentError(err).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className={`rounded-2xl border bg-card p-4 ${active ? "border-sky-500/40" : "opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {product && <img src={product.image} alt="" className="h-12 w-12 rounded object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product?.name ?? "Item"}</p>
          <p className="text-xs text-muted-foreground">
            Fee paid {GHS(r.fee)} · balance {GHS(r.balance)} · {r.refundOnExpiry ? "fee refundable" : "fee non-refundable"}
          </p>
        </div>
        {active ? (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hold ends in</p>
            <p className={`flex items-center gap-1 font-mono text-lg font-black ${remaining < 3_600_000 ? "text-error" : "text-sky-500"}`}>
              <Timer className="h-4 w-4" /> {formatCountdown(remaining)}
            </p>
          </div>
        ) : (
          <Badge variant="secondary" className="capitalize">{r.status}</Badge>
        )}
      </div>
      {active && remaining > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {!order?.serverBacked && (
            <Button size="sm" variant="ghost" disabled={paying} onClick={() => { cancelReservation(r.id); toast.success("Reservation cancelled — stock released"); }}>
              Cancel hold
            </Button>
          )}
          <MethodPicker value={method} onChange={setMethod} disabled={paying} />
          <Button size="sm" onClick={complete} disabled={paying}>
            {paying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Lock className="mr-1 h-4 w-4" />}
            Complete purchase · {GHS(r.balance)}
          </Button>
        </div>
      )}
      {paymentMode() === "demo" && active && (
        <p className="mt-2 text-[11px] text-muted-foreground">Demo mode: payments are simulated locally.</p>
      )}
    </div>
  );
}
