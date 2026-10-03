import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis, useCurrentUser } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { assessCredit, buildInstallmentPlan, fromMinor, getPurchaseConfig, toMinor } from "@/lib/naflis/purchase";
import { localCreditSignals } from "@/services/walletService";
import { MyPlans } from "@/components/naflis/PaymentPlans";

export const Route = createFileRoute("/buyer/installments")({
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const user = useCurrentUser();
  const products = useNaflis((s) => s.products);
  const plans = useNaflis((s) => s.installments);
  const currentUserId = useNaflis((s) => s.currentUserId);
  // Same engine the payment server runs at checkout; requested 0 shows the standing decision.
  const decision = useMemo(() => assessCredit(localCreditSignals(currentUserId), 0), [currentUserId, plans]);
  const score = decision.score;
  const scorePct = (score / 1000) * 100;
  const financeable = products.filter((p) => {
    const c = getPurchaseConfig(p);
    return c.installment.enabled || c.credit.enabled;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl gradient-hero p-6 text-white shadow-premium">
        <div className="flex items-center gap-2 text-white/70">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">Take Now, Pay Later</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold">Your NAFLIS Credit</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr] md:items-center">
          <div>
            <p className="text-xs text-white/70">Credit score</p>
            <p className="text-5xl font-black">{score}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full gradient-gold" style={{ width: `${scorePct}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/70">Out of 1000</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-xs text-white/70">Available credit</p>
              <p className="text-xl font-bold">{GHS(fromMinor(decision.availableMinor))}</p>
              <p className="text-[10px] text-white/60">of {GHS(fromMinor(decision.limitMinor))} limit</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-xs text-white/70">Status</p>
              <p className="text-xl font-bold">{decision.eligible ? "Approved" : "Not eligible yet"}</p>
              <p className="text-[10px] capitalize text-white/60">{decision.band} band</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {decision.checks.filter((c) => c.code !== "limit").map((c) => (
          <div key={c.code} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-error" />}
              {c.label}
            </p>
            <p className={`mt-1 text-lg font-bold ${c.passed ? "text-success" : "text-warning"}`}>{c.detail}</p>
          </div>
        ))}
      </div>

      <MyPlans />

      <div>
        <h2 className="mb-3 text-lg font-bold">Try Pay Later on a product</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(financeable.length ? financeable : products).slice(0, 3).map((p) => (
            <div key={p.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <img src={p.image} className="h-20 w-20 rounded-lg object-cover" alt="" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm font-bold">{GHS(p.price)}</p>
                {(() => {
                  const c = getPurchaseConfig(p);
                  if (!c.installment.enabled) return <p className="text-xs text-muted-foreground">Pay later available</p>;
                  const plan = buildInstallmentPlan(toMinor(p.price), c.installment, 0);
                  return (
                    <p className="text-xs text-muted-foreground">
                      {GHS(fromMinor(plan.dueNowMinor))} down + {c.installment.count} × {GHS(fromMinor(plan.entries[1].amountMinor))}
                    </p>
                  );
                })()}
                <Button asChild size="sm" className="mt-2">
                  <Link to="/buyer/product/$id" params={{ id: p.id }}>Apply</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
