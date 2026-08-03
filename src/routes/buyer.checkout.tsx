import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wallet, CreditCard, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNaflis, useWallet, type PaymentOption } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";

export const Route = createFileRoute("/buyer/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useNaflis((s) => s.cart);
  const products = useNaflis((s) => s.products);
  const applyPromo = useNaflis((s) => s.applyPromo);
  const createOrder = useNaflis((s) => s.createOrder);
  const wallet = useWallet();
  const navigate = useNavigate();

  const items = cart.map((c) => {
    const p = products.find((pp) => pp.id === c.productId)!;
    return { productId: c.productId, qty: c.qty, price: p.price, product: p };
  }).filter((i) => i.product);

  const [address, setAddress] = useState("15 Independence Ave, Osu, Accra");
  const [deliveryMethod, setDeliveryMethod] = useState<"standard" | "express">("standard");
  const [payment, setPayment] = useState<PaymentOption>("wallet");
  const [promoInput, setPromoInput] = useState("");
  const [promoState, setPromoState] = useState<{ code?: string; discount: number; message?: string }>({ discount: 0 });
  const [placing, setPlacing] = useState(false);

  const subtotal = useMemo(() => items.reduce((a, i) => a + i.price * i.qty, 0), [items]);
  const deliveryFee = deliveryMethod === "express" ? 60 : 25;
  const escrowFee = Math.round(subtotal * 0.005);
  const total = subtotal - promoState.discount + deliveryFee + escrowFee;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center">
        <p>Your cart is empty.</p>
        <Button asChild className="mt-3"><Link to="/buyer">Continue shopping</Link></Button>
      </div>
    );
  }

  const applyCode = () => {
    const r = applyPromo(promoInput, subtotal);
    setPromoState({ code: r.ok ? promoInput.toUpperCase() : undefined, discount: r.discount, message: r.message });
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  };

  const placeOrder = async () => {
    if (payment === "wallet" && wallet && wallet.balance < total) {
      toast.error(`Wallet is short by ${GHS(total - wallet.balance)}. Top up first.`);
      return;
    }
    setPlacing(true);
    await new Promise((r) => setTimeout(r, 700));
    const order = createOrder({
      items: items.map(({ productId, qty, price }) => ({ productId, qty, price })),
      promoCode: promoState.code,
      discount: promoState.discount,
      delivery: deliveryFee,
      escrowFee,
      paymentOption: payment,
      address,
    });
    setPlacing(false);
    toast.success("Payment secured in escrow");
    navigate({ to: "/buyer/orders/$orderId", params: { orderId: order.id } });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Step n={1} title="Delivery address">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          <p className="mt-2 text-xs text-muted-foreground">We share only masked contact details with sellers and couriers.</p>
        </Step>

        <Step n={2} title="Delivery method">
          <RadioGroup value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as any)} className="space-y-2">
            <RadioTile value="standard" title="Standard delivery" subtitle="2–4 business days · GHS 25" active={deliveryMethod === "standard"} />
            <RadioTile value="express" title="Express delivery" subtitle="Same-day for Accra · GHS 60" active={deliveryMethod === "express"} />
          </RadioGroup>
        </Step>

        <Step n={3} title="Payment method">
          <RadioGroup value={payment} onValueChange={(v) => setPayment(v as PaymentOption)} className="space-y-2">
            <RadioTile
              value="wallet"
              title={`NAFLIS Wallet · ${GHS(wallet?.balance ?? 0)} available`}
              subtitle="Instant, zero fees"
              icon={<Wallet className="h-5 w-5 text-violet" />}
              active={payment === "wallet"}
            />
            <RadioTile
              value="card"
              title="NAFLIS Card / Bank card"
              subtitle="Visa / Mastercard"
              icon={<CreditCard className="h-5 w-5" />}
              active={payment === "card"}
            />
            <RadioTile
              value="momo"
              title="Mobile Money"
              subtitle="MTN / Vodafone / AirtelTigo"
              icon={<Phone className="h-5 w-5" />}
              active={payment === "momo"}
            />
          </RadioGroup>
        </Step>

        <Step n={4} title="Escrow protection">
          <div className="flex gap-3 rounded-lg border bg-accent/50 p-3">
            <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
            <p className="text-sm">
              Your payment stays in <b>NAFLIS Escrow</b> until you confirm delivery. If anything goes wrong, open a dispute
              and our resolution team can refund fully or partially.
            </p>
          </div>
        </Step>
      </div>

      <aside className="sticky top-24 h-fit space-y-4 rounded-2xl border bg-card p-5">
        <h3 className="font-bold">Review & pay</h3>
        <div className="space-y-2 text-sm">
          {items.map((i) => (
            <div key={i.productId} className="flex items-center gap-2">
              <img src={i.product.image} className="h-10 w-10 rounded object-cover" alt="" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{i.product.name}</p>
                <p className="text-[11px] text-muted-foreground">Qty {i.qty}</p>
              </div>
              <span className="text-xs font-semibold">{GHS(i.price * i.qty)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Promo code</Label>
          <div className="flex gap-2">
            <Input placeholder="NAFLIS10" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
            <Button variant="outline" onClick={applyCode}>Apply</Button>
          </div>
          {promoState.message && (
            <p className={`text-[11px] ${promoState.code ? "text-success" : "text-error"}`}>{promoState.message}</p>
          )}
        </div>

        <dl className="space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={GHS(subtotal)} />
          {promoState.discount > 0 && <Row label={`Promo ${promoState.code}`} value={<span className="text-success">-{GHS(promoState.discount)}</span>} />}
          <Row label="Delivery" value={GHS(deliveryFee)} />
          <Row label="Escrow fee (0.5%)" value={GHS(escrowFee)} />
        </dl>
        <div className="flex items-center justify-between border-t pt-3 font-bold">
          <span>Total</span>
          <span>{GHS(total)}</span>
        </div>
        <Button size="lg" className="w-full" onClick={placeOrder} disabled={placing}>
          {placing ? "Securing in escrow…" : `Pay ${GHS(total)}`}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">By continuing you accept NAFLIS terms.</p>
      </aside>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-violet text-xs font-bold text-violet-foreground">{n}</span>
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
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${active ? "border-violet bg-accent" : "hover:bg-muted"}`}>
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
