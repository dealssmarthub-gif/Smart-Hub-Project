import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { fromMinor, getPurchaseConfig, quoteReservation, toMinor } from "@/lib/naflis/purchase";
import { MyReservations } from "@/components/naflis/PaymentPlans";

export const Route = createFileRoute("/buyer/reserve")({
  component: ReservePage,
});

function ReservePage() {
  const products = useNaflis((s) => s.products);
  const reservable = products.filter((p) => getPurchaseConfig(p).reservation.enabled && p.stock > 0);
  const sample = (reservable.length ? reservable : products).slice(0, 3);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 text-sky-500">
          <Clock className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-widest">Reserve & Pay</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold">Lock in the item and the price today</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Pay a small reservation fee and the seller holds the stock for you until the timer runs out. Complete the
          purchase before then, or split it into installments on products that offer them. No credit check.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "1. Reserve", body: "Pay the seller's reservation fee from your wallet, card or MoMo. Stock is set aside instantly." },
          { title: "2. Beat the timer", body: "Each product shows how long it's held. The fee usually counts towards the price." },
          { title: "3. Complete & receive", body: "Pay the balance and the order goes to the seller for dispatch. Lapsed holds release the stock." },
        ].map((s) => (
          <div key={s.title} className="rounded-xl border bg-card p-5">
            <p className="font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <MyReservations />

      <div>
        <h2 className="mb-3 text-lg font-bold">Popular products for Reserve & Pay</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {sample.map((p) => (
            <div key={p.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <img src={p.image} className="h-20 w-20 rounded-lg object-cover" alt="" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm font-bold">{GHS(p.price)}</p>
                {getPurchaseConfig(p).reservation.enabled && (
                  <p className="text-xs text-muted-foreground">
                    Reserve for {GHS(fromMinor(quoteReservation(toMinor(p.price), getPurchaseConfig(p).reservation, 0).feeMinor))} ·
                    held {getPurchaseConfig(p).reservation.durationHours}h
                  </p>
                )}
                <Button asChild size="sm" className="mt-2">
                  <Link to="/buyer/product/$id" params={{ id: p.id }}>Reserve</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
