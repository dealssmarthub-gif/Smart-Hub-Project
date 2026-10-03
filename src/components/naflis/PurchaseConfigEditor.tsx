import type { ReactNode } from "react";
import { AlertCircle, CalendarClock, CreditCard, Lock, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GHS } from "@/lib/naflis/format";
import {
  DELIVERY_RULE_LABEL,
  buildCreditPlan,
  buildInstallmentPlan,
  fromMinor,
  quoteReservation,
  toMinor,
  validatePurchaseConfig,
  type DeliveryRule,
  type Frequency,
  type PurchaseConfig,
} from "@/lib/naflis/purchase";

const selectClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const FREQUENCY_LABEL: Record<Frequency, string> = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly" };

/** Seller-side toggles and terms for each purchase method. */
export function PurchaseConfigEditor({
  value,
  onChange,
  price,
}: {
  value: PurchaseConfig;
  onChange: (next: PurchaseConfig) => void;
  /** Product price in GHS, for live previews. */
  price?: number;
}) {
  const errors = validatePurchaseConfig(value, price);
  const priceMinor = price && price > 0 ? toMinor(price) : 0;
  const set = <K extends keyof PurchaseConfig>(key: K, patch: Partial<PurchaseConfig[K]>) =>
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  const num = (v: string) => (v === "" ? NaN : Number(v));

  const inst = priceMinor ? buildInstallmentPlan(priceMinor, value.installment, 0) : null;
  const credit = priceMinor ? buildCreditPlan(priceMinor, value.credit, 0) : null;
  const reserve = priceMinor ? quoteReservation(priceMinor, value.reservation, 0) : null;

  return (
    <div className="space-y-3">
      <div>
        <Label>Purchase methods</Label>
        <p className="text-xs text-muted-foreground">Choose how buyers can pay for this product. Terms are enforced at checkout.</p>
      </div>

      <MethodCard
        icon={<Wallet className="h-4 w-4" />}
        title="Pay in full"
        hint="Paid upfront into escrow."
        enabled={value.payInFull.enabled}
        onToggle={(enabled) => set("payInFull", { enabled })}
      />

      <MethodCard
        icon={<CreditCard className="h-4 w-4" />}
        title="Credit sale (pay later)"
        hint="NAFLIS pays you on completion; the buyer repays NAFLIS. Requires a credit check."
        enabled={value.credit.enabled}
        onToggle={(enabled) => set("credit", { enabled })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repayments">
            <Input type="number" min={2} max={12} value={value.credit.termCount} onChange={(e) => set("credit", { termCount: num(e.target.value) })} />
          </Field>
          <Field label="Frequency">
            <FrequencySelect value={value.credit.frequency} onChange={(frequency) => set("credit", { frequency })} />
          </Field>
          <Field label="Finance charge (%)">
            <Input type="number" min={0} max={30} step={0.5} value={value.credit.financeChargePct} onChange={(e) => set("credit", { financeChargePct: num(e.target.value) })} />
          </Field>
          <Field label="Min. credit score">
            <Input type="number" min={300} max={900} step={10} value={value.credit.minCreditScore} onChange={(e) => set("credit", { minCreditScore: num(e.target.value) })} />
          </Field>
        </div>
        {credit && (
          <Preview>
            Buyer pays nothing today, then {value.credit.termCount} × {GHS(fromMinor(credit.entries[0].amountMinor))} ({FREQUENCY_LABEL[value.credit.frequency].toLowerCase()}).
          </Preview>
        )}
      </MethodCard>

      <MethodCard
        icon={<CalendarClock className="h-4 w-4" />}
        title="Installment payment"
        hint="Deposit now, the rest on a schedule. You choose when it ships."
        enabled={value.installment.enabled}
        onToggle={(enabled) => set("installment", { enabled })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deposit (%)">
            <Input type="number" min={10} max={90} value={value.installment.depositPct} onChange={(e) => set("installment", { depositPct: num(e.target.value) })} />
          </Field>
          <Field label="Installments">
            <Input type="number" min={2} max={24} value={value.installment.count} onChange={(e) => set("installment", { count: num(e.target.value) })} />
          </Field>
          <Field label="Frequency">
            <FrequencySelect value={value.installment.frequency} onChange={(frequency) => set("installment", { frequency })} />
          </Field>
          <Field label="Grace period (days)">
            <Input type="number" min={0} max={30} value={value.installment.gracePeriodDays} onChange={(e) => set("installment", { gracePeriodDays: num(e.target.value) })} />
          </Field>
          <Field label="Late fee (%)">
            <Input type="number" min={0} max={20} step={0.5} value={value.installment.lateFeePct} onChange={(e) => set("installment", { lateFeePct: num(e.target.value) })} />
          </Field>
          <Field label="Delivery rule">
            <select
              className={selectClass}
              value={value.installment.deliveryRule}
              onChange={(e) => set("installment", { deliveryRule: e.target.value as DeliveryRule })}
            >
              <option value="on_deposit" className="bg-background">After deposit</option>
              <option value="after_installments" className="bg-background">After N installments</option>
              <option value="on_full_payment" className="bg-background">After full payment</option>
            </select>
          </Field>
          {value.installment.deliveryRule === "after_installments" && (
            <Field label="Ship after installment #">
              <Input
                type="number"
                min={1}
                max={value.installment.count}
                value={value.installment.deliverAfterInstallments}
                onChange={(e) => set("installment", { deliverAfterInstallments: num(e.target.value) })}
              />
            </Field>
          )}
        </div>
        {inst && (
          <Preview>
            {GHS(fromMinor(inst.dueNowMinor))} deposit + {value.installment.count} × {GHS(fromMinor(inst.entries[1].amountMinor))}{" "}
            ({FREQUENCY_LABEL[value.installment.frequency].toLowerCase()}). {DELIVERY_RULE_LABEL[value.installment.deliveryRule]}.
          </Preview>
        )}
      </MethodCard>

      <MethodCard
        icon={<Lock className="h-4 w-4" />}
        title="Inventory reservation"
        hint="A fee holds stock for the buyer until they pay the balance."
        enabled={value.reservation.enabled}
        onToggle={(enabled) => set("reservation", { enabled })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee type">
            <select
              className={selectClass}
              value={value.reservation.feeType}
              onChange={(e) => set("reservation", { feeType: e.target.value as "fixed" | "percent", feeValue: e.target.value === "percent" ? 10 : 50 })}
            >
              <option value="percent" className="bg-background">% of price</option>
              <option value="fixed" className="bg-background">Fixed (GHS)</option>
            </select>
          </Field>
          <Field label={value.reservation.feeType === "percent" ? "Fee (%)" : "Fee (GHS)"}>
            <Input type="number" min={0} step={value.reservation.feeType === "percent" ? 1 : 5} value={value.reservation.feeValue} onChange={(e) => set("reservation", { feeValue: num(e.target.value) })} />
          </Field>
          <Field label="Hold for (hours)">
            <Input type="number" min={1} max={720} value={value.reservation.durationHours} onChange={(e) => set("reservation", { durationHours: num(e.target.value) })} />
          </Field>
          <div className="space-y-2 pt-1 text-xs">
            <Check label="Auto-expire & release stock" checked={value.reservation.autoExpire} onChange={(autoExpire) => set("reservation", { autoExpire })} />
            <Check label="Fee counts towards price" checked={value.reservation.feeCreditedToPrice} onChange={(feeCreditedToPrice) => set("reservation", { feeCreditedToPrice })} />
            <Check label="Refund fee on expiry" checked={value.reservation.refundOnExpiry} onChange={(refundOnExpiry) => set("reservation", { refundOnExpiry })} />
          </div>
        </div>
        {reserve && (
          <Preview>
            {GHS(fromMinor(reserve.feeMinor))} holds it for {value.reservation.durationHours}h; balance {GHS(fromMinor(reserve.balanceMinor))}.{" "}
            {value.reservation.refundOnExpiry ? "Fee refunded if it lapses." : "Fee kept if it lapses."}
          </Preview>
        )}
      </MethodCard>

      {errors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-error/40 bg-error/5 p-3 text-xs text-error">
          {errors.map((e) => (
            <p key={e} className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function MethodCard({
  icon,
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 transition ${enabled ? "border-sky-500/50 bg-sky-500/5" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${enabled ? "text-sky-500" : "text-muted-foreground"}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={title} />
      </div>
      {enabled && children && <div className="mt-3 space-y-3 border-t pt-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function FrequencySelect({ value, onChange }: { value: Frequency; onChange: (f: Frequency) => void }) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value as Frequency)}>
      {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
        <option key={f} value={f} className="bg-background">{FREQUENCY_LABEL[f]}</option>
      ))}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-sky-500" />
      {label}
    </label>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{children}</p>;
}
