import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, CreditCard, Lock, Timer, Truck, Wallet, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFeatureFlag } from "@/lib/featureFlags";
import { GHS, fmtDate } from "@/lib/naflis/format";
import {
  DELIVERY_RULE_LABEL,
  PURCHASE_METHOD_LABEL,
  assessCredit,
  buildCreditPlan,
  buildInstallmentPlan,
  enabledMethods,
  fromMinor,
  getPurchaseConfig,
  quoteReservation,
  toMinor,
  type PlanQuote,
  type PurchaseMethod,
} from "@/lib/naflis/purchase";
import { useNaflis, type Product } from "@/lib/naflis/store";
import { localCreditSignals } from "@/services/walletService";

/** Re-renders every `intervalMs` with the current time. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

const ICON: Record<PurchaseMethod, typeof Wallet> = { full: Wallet, installment: CalendarClock, credit: CreditCard, reservation: Lock };
const FREQ: Record<string, string> = { weekly: "week", biweekly: "2 weeks", monthly: "month" };

/** Product-page purchase tabs. `onChoose` puts the product in the cart with that method. */
export function PurchaseOptions({ product, onChoose }: { product: Product; onChoose: (method: PurchaseMethod) => void }) {
  const config = getPurchaseConfig(product);
  const reserveFlag = useFeatureFlag("reserve_and_pay");
  const payLaterFlag = useFeatureFlag("take_now_pay_later");
  const methods = enabledMethods(config).filter(
    (m) => (m !== "reservation" || reserveFlag) && ((m !== "credit" && m !== "installment") || payLaterFlag),
  );
  const [tab, setTab] = useState<PurchaseMethod>(methods[0] ?? "full");
  const now = useNow(1000);
  const priceMinor = toMinor(product.price);

  const currentUserId = useNaflis((s) => s.currentUserId);
  const activeReservation = useNaflis((s) =>
    s.reservations.find((r) => r.productId === product.id && r.buyerId === s.currentUserId && r.status === "active"),
  );
  // Plans are previewed from "now" but only recomputed each minute to keep dates stable.
  const startAt = Math.floor(now / 60_000) * 60_000;
  const installment = useMemo(() => buildInstallmentPlan(priceMinor, config.installment, startAt), [priceMinor, config.installment, startAt]);
  const credit = useMemo(() => buildCreditPlan(priceMinor, config.credit, startAt), [priceMinor, config.credit, startAt]);
  const reservation = useMemo(() => quoteReservation(priceMinor, config.reservation, startAt), [priceMinor, config.reservation, startAt]);
  const decision = useMemo(
    () => assessCredit(localCreditSignals(currentUserId), credit.totalMinor, config.credit.minCreditScore),
    [currentUserId, credit.totalMinor, config.credit.minCreditScore],
  );

  if (methods.length <= 1 && methods[0] === "full") return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ways to buy</p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as PurchaseMethod)}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {methods.map((m) => {
            const Icon = ICON[m];
            return (
              <TabsTrigger key={m} value={m} className="gap-1.5 text-xs">
                <Icon className="h-3.5 w-3.5" /> {PURCHASE_METHOD_LABEL[m]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="full" className="mt-3 space-y-3 text-sm">
          <p>Pay {GHS(product.price)} today. Funds sit in NAFLIS escrow until you confirm delivery.</p>
          <Button className="w-full" onClick={() => onChoose("full")}>Buy now · {GHS(product.price)}</Button>
        </TabsContent>

        <TabsContent value="installment" className="mt-3 space-y-3 text-sm">
          <PlanBreakdown plan={installment} />
          <Ledger plan={installment} />
          <p className="flex items-start gap-2 rounded-lg bg-muted p-2.5 text-xs">
            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
            <span>
              <b>Delivery terms:</b> {DELIVERY_RULE_LABEL[installment.deliveryRule]}
              {installment.deliveryRule === "after_installments" ? ` (#${installment.deliverAfterInstallments})` : ""}.
              {installment.gracePeriodDays > 0 && ` ${installment.gracePeriodDays}-day grace period on each payment`}
              {installment.lateFeePct > 0 && `, then a ${installment.lateFeePct}% late fee.`}
            </span>
          </p>
          <Button className="w-full" onClick={() => onChoose("installment")}>
            Pay {GHS(fromMinor(installment.dueNowMinor))} deposit
          </Button>
        </TabsContent>

        <TabsContent value="credit" className="mt-3 space-y-3 text-sm">
          <PlanBreakdown plan={credit} />
          <Ledger plan={credit} />
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Your eligibility</p>
              <Badge variant={decision.eligible ? "default" : "outline"} className="capitalize">
                {decision.eligible ? "Pre-approved" : "Not eligible yet"} · score {decision.score}
              </Badge>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {decision.checks.map((c) => (
                <li key={c.code} className="flex items-center gap-2">
                  {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-error" />}
                  <span className="flex-1">{c.label}</span>
                  <span className="text-muted-foreground">{c.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Final approval happens at checkout against your verified account.</p>
          </div>
          <Button className="w-full" disabled={!decision.eligible} onClick={() => onChoose("credit")}>
            Take now, pay {GHS(fromMinor(credit.entries[0].amountMinor))} per {FREQ[credit.frequency]}
          </Button>
          {!decision.eligible && (
            <Button asChild variant="link" size="sm" className="w-full">
              <Link to="/buyer/installments">See how to qualify</Link>
            </Button>
          )}
        </TabsContent>

        <TabsContent value="reservation" className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Reservation fee" value={GHS(fromMinor(reservation.feeMinor))} />
            <Stat label="Held for" value={reservation.durationHours >= 48 ? `${Math.round(reservation.durationHours / 24)} days` : `${reservation.durationHours} hours`} />
            <Stat label="Balance later" value={GHS(fromMinor(reservation.balanceMinor))} />
          </div>
          {activeReservation ? (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">You've reserved this item. Hold ends in</p>
              <p className="mt-1 flex items-center justify-center gap-2 font-mono text-2xl font-black text-sky-500">
                <Timer className="h-5 w-5" /> {formatCountdown(activeReservation.expiresAt - now)}
              </p>
              <Button asChild size="sm" className="mt-2">
                <Link to="/buyer/reserve">Complete purchase · {GHS(activeReservation.balance)}</Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-lg bg-muted p-3 text-xs">
              <p className="flex items-center gap-2 font-semibold">
                <Timer className="h-3.5 w-3.5 text-sky-500" /> Reserve now and it's held until{" "}
                {new Date(now + reservation.durationHours * 3_600_000).toLocaleString("en-GH", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
              </p>
              <p className="mt-1 text-muted-foreground">
                {reservation.autoExpire ? "If you don't complete the purchase in time the hold lapses and stock is released." : "The seller releases the hold manually."}{" "}
                {reservation.refundOnExpiry ? "Your fee is refunded if it lapses." : "The fee is non-refundable if it lapses."}
                {config.reservation.feeCreditedToPrice && " The fee counts towards the price."}
              </p>
            </div>
          )}
          {!activeReservation && (
            <Button className="w-full" variant="outline" onClick={() => onChoose("reservation")}>
              <Lock className="mr-1 h-4 w-4" /> Reserve for {GHS(fromMinor(reservation.feeMinor))}
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlanBreakdown({ plan }: { plan: PlanQuote }) {
  const recurring = plan.entries.filter((e) => e.kind === "installment");
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <Stat label="Today" value={GHS(fromMinor(plan.dueNowMinor))} />
      <Stat label={`${recurring.length} × every ${FREQ[plan.frequency]}`} value={GHS(fromMinor(recurring[0]?.amountMinor ?? 0))} />
      <Stat label={plan.chargeMinor ? `Total (incl. ${GHS(fromMinor(plan.chargeMinor))} fee)` : "Total"} value={GHS(fromMinor(plan.totalMinor))} />
    </div>
  );
}

/** Payment ledger preview: every scheduled charge with its due date and grace deadline. */
export function Ledger({ plan }: { plan: PlanQuote }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">#</th>
            <th className="px-2.5 py-1.5 font-medium">Due</th>
            <th className="px-2.5 py-1.5 font-medium">Grace until</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {plan.entries.map((e) => (
            <tr key={e.seq} className="border-t">
              <td className="px-2.5 py-1.5">{e.kind === "deposit" ? "Deposit" : e.seq}</td>
              <td className="px-2.5 py-1.5">{e.kind === "deposit" ? "Today" : fmtDate(e.dueAt)}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{e.kind === "deposit" ? "—" : fmtDate(e.graceUntil)}</td>
              <td className="px-2.5 py-1.5 text-right font-semibold">{GHS(fromMinor(e.amountMinor))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
