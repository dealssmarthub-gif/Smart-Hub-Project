import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis, useCurrentUser } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";

export const Route = createFileRoute("/buyer/installments")({
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const user = useCurrentUser();
  const products = useNaflis((s) => s.products);
  const score = user?.creditScore ?? 0;
  const scorePct = (score / 1000) * 100;

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
              <p className="text-xs text-white/70">Credit limit</p>
              <p className="text-xl font-bold">{GHS(user?.creditLimit ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-xs text-white/70">Status</p>
              <p className="text-xl font-bold">
                {score >= 700 ? "Approved" : score >= 500 ? "Higher deposit needed" : "Not eligible"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { title: "Identity & verification", val: user?.verified ? "Verified" : "Pending", good: !!user?.verified },
          { title: "Wallet activity", val: "Consistent", good: true },
          { title: "Repayment history", val: score >= 700 ? "Strong" : "New", good: score >= 700 },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{f.title}</p>
            <p className={`mt-1 text-lg font-bold ${f.good ? "text-success" : "text-warning"}`}>{f.val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-accent p-5">
        <Badge className="bg-success text-success-foreground gap-1">
          <CheckCircle2 className="h-3 w-3" /> Full workflow ships in Phase 2
        </Badge>
        <p className="mt-2 text-sm">
          Next: interactive down-payment slider, installment schedule, auto-deduction mandate, and real-time repayment
          progress. Approved and declined demo applicants are already seeded.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Try Pay Later on a product</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {products.slice(0, 3).map((p) => (
            <div key={p.id} className="flex gap-3 rounded-xl border bg-card p-3">
              <img src={p.image} className="h-20 w-20 rounded-lg object-cover" alt="" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-sm font-bold">{GHS(p.price)}</p>
                <p className="text-xs text-muted-foreground">
                  Down GHS {Math.round(p.price * 0.3)} + 6 × GHS {Math.round((p.price * 0.75) / 6)}
                </p>
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
