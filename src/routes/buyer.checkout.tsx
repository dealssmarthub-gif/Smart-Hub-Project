import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Phone, RefreshCw, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNaflis, useWallet } from "@/lib/naflis/store";
import { GHS, fmtDate } from "@/lib/naflis/format";
import { useFeatureFlag } from "@/lib/featureFlags";
import {
  PURCHASE_METHOD_LABEL,
  canonicalCheckoutRequest,
  enabledMethods,
  fromMinor,
  getPurchaseConfig,
  type CheckoutRequest,
  type DeliveryMethod,
  type PurchaseMethod,
} from "@/lib/naflis/purchase";
import {
  checkout,
  describePaymentError,
  newIdempotencyKey,
  paymentMode,
  quoteLocally,
  refreshWallet,
  type PaymentMethod,
  type PaymentStage,
} from "@/services/walletService";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/checkout")({
  component: CheckoutPage,
});

const STAGE_LABEL: Record<PaymentStage, string> = {
  creating_intent: "Creating secure payment…",
  awaiting_provider: "Complete the payment in the Paystack window…",
  confirming: "Confirming with NAFLIS Wallet…",
  verifying: "Verifying with the payment provider…",
};

function CheckoutPage() {
  const cart = useNaflis((s) => s.cart);
  const products = useNaflis((s) => s.products);
  const currentUserId = useNaflis((s) => s.currentUserId);
  const setCartMethod = useNaflis((s) => s.setCartMethod);
  const wallet = useWallet();
  const navigate = useNavigate();
  const reserveFlag = useFeatureFlag("reserve_and_pay");
  const payLaterFlag = useFeatureFlag("take_now_pay_later");
  const mode = paymentMode();

  const [address, setAddress] = useState("15 Independence Ave, Osu, Accra");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("standard");
  const [payment, setPayment] = useState<PaymentMethod>("wallet");
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | undefined>();
  const [stage, setStage] = useState<PaymentStage | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);

  useEffect(() => {
    refreshWallet().catch(() => {
      // balance shown from the last known local copy
    });
  }, []);

  const lines = cart
    .map((c) => {
      const product = products.find((p) => p.id === c.productId);
      if (!product) return null;
      const methods = enabledMethods(getPurchaseConfig(product)).filter(
        (m) => (m !== "reservation" || reserveFlag) && ((m !== "credit" && m !== "installment") || payLaterFlag),
      );
      const method: PurchaseMethod = c.method && methods.includes(c.method) ? c.method : methods[0] ?? "full";
      return { product, qty: c.qty, method, methods };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const request: CheckoutRequest = {
    lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty, method: l.method })),
    promoCode,
    deliveryMethod,
    paymentMethod: payment,
    address,
  };
  const requestHash = canonicalCheckoutRequest(request);
  // Preview only — the payment server re-prices from its own data.
  const quote = useMemo(() => quoteLocally(request, currentUserId), [requestHash, currentUserId, products]); // eslint-disable-line react-hooks/exhaustive-deps

  // One idempotency key per distinct request: retries and double-clicks reuse it,
  // so the server returns the same payment instead of charging again.
  const keyRef = useRef<{ hash: string; key: string } | null>(null);
  const keyFor = (hash: string) => {
    if (!keyRef.current || keyRef.current.hash !== hash) keyRef.current = { hash, key: newIdempotencyKey() };
    return keyRef.current.key;
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p>Your cart is empty.</p>
        <Button asChild className="mt-3"><Link to="/buyer">Continue shopping</Link></Button>
      </div>
    );
  }

  const dueNow = fromMinor(quote.dueNowMinor);
  const blocking = quote.errors.filter((e) => e.code !== "PROMO_INVALID" || promoCode);
  const walletShort = payment === "wallet" && wallet ? Math.max(0, dueNow - wallet.balance) : 0;
  const busy = stage !== null;

  const pay = async () => {
    if (busy) return;
    setFailure(null);
    try {
      const outcome = await checkout({ request, idempotencyKey: keyFor(requestHash) }, setStage);
      toast.success(outcome.message);
      if (outcome.orderId) navigate({ to: "/buyer/orders/$orderId", params: { orderId: outcome.orderId } });
      else navigate({ to: "/buyer/orders" });
    } catch (err) {
      const d = describePaymentError(err);
      setFailure(d);
      // A definitive failure ends this attempt; the next click is a new payment.
      if (!d.retryable) keyRef.current = null;
      toast.error(d.message);
    } finally {
      setStage(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Step n={1} title="How you're paying for each item">
          <div className="divide-y">
            {quote.lines.map((ql) => {
              const line = lines.find((l) => l.product.id === ql.productId)!;
              return (
                <div key={ql.productId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <img src={line.product.image} className="h-12 w-12 rounded object-cover" alt="" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty {ql.qty} · {GHS(fromMinor(ql.lineTotalMinor))}
                      {ql.plan && ` · ${GHS(fromMinor(ql.dueNowMinor))} today, ${ql.plan.entries.filter((e) => e.kind === "installment").length} payments from ${fmtDate(ql.plan.entries.find((e) => e.kind === "installment")!.dueAt)}`}
                      {ql.reservation && ` · held until ${new Date(ql.reservation.expiresAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                  {line.methods.length > 1 ? (
                    <select
                      aria-label={`Purchase method for ${line.product.name}`}
                      value={line.method}
                      disabled={busy}
                      onChange={(e) => setCartMethod(line.product.id, e.target.value as PurchaseMethod)}
                      className="rounded-md border bg-background px-2 py-1.5 text-xs font-medium"
                    >
                      {line.methods.map((m) => <option key={m} value={m}>{PURCHASE_METHOD_LABEL[m]}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">{PURCHASE_METHOD_LABEL[line.method]}</span>
                  )}
                </div>
              );
            })}
          </div>
          {quote.credit && (
            <div className="mt-3 rounded-lg border p-3 text-xs">
              <p className="font-semibold">Pay-later check · score {quote.credit.score}</p>
              <ul className="mt-1.5 space-y-1">
                {quote.credit.checks.map((c) => (
                  <li key={c.code} className="flex items-center gap-2">
                    {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-error" />}
                    <span className="flex-1">{c.label}</span>
                    <span className="text-muted-foreground">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Step>

        <Step n={2} title="Delivery address">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} disabled={busy} />
          <p className="mt-2 text-xs text-muted-foreground">We share only masked contact details with sellers and couriers.</p>
        </Step>

        <Step n={3} title="Delivery method">
          <RadioGroup value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)} className="space-y-2" disabled={busy}>
            <RadioTile value="standard" title="Standard delivery" subtitle="2–4 business days · GHS 25" active={deliveryMethod === "standard"} />
            <RadioTile value="express" title="Express delivery" subtitle="Same-day for Accra · GHS 60" active={deliveryMethod === "express"} />
          </RadioGroup>
          {quote.deliveryDeferred && <p className="mt-2 text-xs text-muted-foreground">Reservations pay delivery when you complete the purchase.</p>}
        </Step>

        <Step n={4} title={`Pay ${GHS(dueNow)} today with`}>
          <RadioGroup value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)} className="space-y-2" disabled={busy}>
            <RadioTile
              value="wallet"
              title={`NAFLIS Wallet · ${GHS(wallet?.balance ?? 0)} available`}
              subtitle={walletShort > 0 ? `Short by ${GHS(walletShort)} — top up first` : "Instant, zero fees"}
              icon={<Wallet className="h-5 w-5 text-sky-500" />}
              active={payment === "wallet"}
            />
            <RadioTile value="card" title="NAFLIS Card / Bank card" subtitle="Visa / Mastercard via Paystack" icon={<CreditCard className="h-5 w-5" />} active={payment === "card"} />
            <RadioTile value="momo" title="Mobile Money" subtitle="MTN / Telecel / AirtelTigo via Paystack" icon={<Phone className="h-5 w-5" />} active={payment === "momo"} />
          </RadioGroup>
        </Step>

        <div className="flex gap-3 rounded-2xl border bg-accent/50 p-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
          <p className="text-sm">
            Money you pay today sits in <b>NAFLIS Escrow</b> until you confirm delivery.{" "}
            {mode === "server"
              ? "Your payment is confirmed by the NAFLIS payment server — never by this page alone."
              : "Demo mode: no payment backend is configured, so payments are simulated locally and no real money moves."}
          </p>
        </div>
      </div>

      <aside className="sticky top-24 h-fit space-y-4 rounded-2xl border bg-card p-5">
        <h3 className="font-bold">Review & pay</h3>

        <div className="space-y-1">
          <Label className="text-xs">Promo code (pay-in-full items)</Label>
          <div className="flex gap-2">
            <Input placeholder="NAFLIS10" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} disabled={busy} />
            {promoCode ? (
              <Button variant="outline" onClick={() => { setPromoCode(undefined); setPromoInput(""); }} disabled={busy}>Remove</Button>
            ) : (
              <Button variant="outline" onClick={() => setPromoCode(promoInput.trim() || undefined)} disabled={busy || !promoInput.trim()}>Apply</Button>
            )}
          </div>
          {quote.promoMessage && <p className="text-[11px] text-success">{quote.promoMessage}</p>}
        </div>

        <dl className="space-y-1 border-t pt-3 text-sm">
          <Row label="Items" value={GHS(fromMinor(quote.subtotalMinor))} />
          {quote.discountMinor > 0 && <Row label={`Promo ${quote.promoCode}`} value={<span className="text-success">-{GHS(fromMinor(quote.discountMinor))}</span>} />}
          <Row label="Delivery" value={quote.deliveryDeferred ? "On completion" : GHS(fromMinor(quote.deliveryMinor))} />
          <Row label="Escrow fee (0.5%)" value={GHS(fromMinor(quote.escrowFeeMinor))} />
          {quote.laterMinor > 0 && <Row label="Due later" value={GHS(fromMinor(quote.laterMinor))} />}
        </dl>
        <div className="flex items-center justify-between border-t pt-3 font-bold">
          <span>Due today</span>
          <span>{GHS(dueNow)}</span>
        </div>

        {blocking.length > 0 && (
          <div className="space-y-1 rounded-lg border border-error/40 bg-error/5 p-3 text-xs text-error">
            {blocking.map((e, i) => (
              <p key={i} className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e.message}</p>
            ))}
          </div>
        )}

        {failure && (
          <div className="space-y-2 rounded-lg border border-error/40 bg-error/5 p-3 text-xs">
            <p className="flex items-start gap-1.5 text-error"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {failure.message}</p>
            {failure.retryable && (
              <Button size="sm" variant="outline" onClick={pay} disabled={busy} className="w-full">
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry safely (you won't be charged twice)
              </Button>
            )}
            {walletShort > 0 && (
              <Button size="sm" variant="ghost" asChild className="w-full">
                <Link to="/buyer/wallet">Top up wallet</Link>
              </Button>
            )}
          </div>
        )}

        <Button size="lg" className="w-full" onClick={pay} disabled={busy || blocking.length > 0}>
          {busy ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {STAGE_LABEL[stage!]}</>
          ) : (
            `Pay ${GHS(dueNow)}`
          )}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">By continuing you accept NAFLIS terms and the purchase terms shown above.</p>
      </aside>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-500 text-xs font-bold text-white">{n}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function RadioTile({ value, title, subtitle, icon, active }: {
  value: string; title: string; subtitle?: string; icon?: React.ReactNode; active: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${active ? "border-sky-500 bg-accent" : "hover:bg-muted"}`}>
      <RadioGroupItem value={value} />
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
