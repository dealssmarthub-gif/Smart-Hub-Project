import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";

export const Route = createFileRoute("/buyer/reserve")({
  component: ReservePage,
});

function ReservePage() {
  const products = useNaflis((s) => s.products);
  const sample = products.slice(0, 3);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 text-violet">
          <Clock className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-widest">Reserve & Pay</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold">Lock in the discount today, pay gradually</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Choose weekly, biweekly, or monthly installments. Your product is reserved from stock and delivered
          once you complete the plan. No credit check — no risk.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "1. Pick a product & plan", body: "Choose 4, 8, or 12 installments. Reserve fee is 10% of the total." },
          { title: "2. Auto-deduct or top up", body: "Wallet, mobile money, or bank account — set it and forget it." },
          { title: "3. Receive on completion", body: "Once the final installment clears, delivery is scheduled." },
        ].map((s) => (
          <div key={s.title} className="rounded-xl border bg-card p-5">
            <p className="font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-accent p-5">
        <div className="flex items-center gap-2">
          <Badge className="bg-success text-success-foreground gap-1">
            <CheckCircle2 className="h-3 w-3" /> Full workflow ships in Phase 2
          </Badge>
        </div>
        <p className="mt-2 text-sm">
          The next build phase adds the full Reserve & Pay dashboard: schedule view, early payment, cancellation & refund
          terms, and automatic wallet deductions.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Popular products for Reserve & Pay</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {sample.map((p) => (
            <div key={p.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <img src={p.image} className="h-20 w-20 rounded-lg object-cover" alt="" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm font-bold">{GHS(p.price)}</p>
                <p className="text-xs text-muted-foreground">or {GHS(Math.round(p.price / 8))} × 8 weeks</p>
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
