import { createFileRoute, redirect } from "@tanstack/react-router";
import { Wallet as WalletIcon, TrendingDown, RefreshCw, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, fmtDate } from "@/lib/naflis/format";

export const Route = createFileRoute("/finance")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "finance") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/finance",
        },
      });
    }
  },
  component: FinanceDashboard,
});

function FinanceDashboard() {
  const users = useNaflis((s) => s.users);
  const wallets = useNaflis((s) => s.wallets);
  const orders = useNaflis((s) => s.orders);
  const installments = useNaflis((s) => s.installments);

  const totalEscrow = Object.values(wallets).reduce((a, w) => a + w.escrow, 0);
  const totalBalance = Object.values(wallets).reduce((a, w) => a + w.balance, 0);
  const activePlans = installments.filter((i) => i.status === "active" || i.status === "late");
  const outstandingCredit = activePlans.reduce((a, i) => a + (i.total - i.paid), 0);

  const applications = useMemo(
    () => users.filter((u) => u.role === "buyer").map((u) => ({
      user: u,
      approved: (u.creditLimit ?? 0) > 0,
    })),
    [users],
  );

  const refundQueue = orders.filter((o) => o.status === "refund-approved").slice(0, 5);

  return (
    <RoleShell
      title="Finance Officer"
      subtitle="Credit approvals, escrow, settlements, and platform financial health."
      icon={WalletIcon}
      badge="Live"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Escrow held" value={GHS(totalEscrow)} hint="Across all buyers" />
        <MetricCard label="Wallet float" value={GHS(totalBalance)} hint="Idle balances" />
        <MetricCard label="Outstanding credit" value={GHS(outstandingCredit)} hint={`${activePlans.length} active plans`} />
        <MetricCard label="Refund queue" value={String(refundQueue.length)} hint="Awaiting payout" />
      </div>

      <Tabs defaultValue="credit" className="mt-6">
        <TabsList>
          <TabsTrigger value="credit">Credit</TabsTrigger>
          <TabsTrigger value="escrow">Escrow ageing</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
        </TabsList>

        <TabsContent value="credit" className="mt-4 space-y-2">
          {applications.map(({ user, approved }) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <img src={user.avatar} alt="" className="h-10 w-10 rounded-full border" />
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Score {user.creditScore ?? "—"} · Limit {GHS(user.creditLimit ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={approved ? "secondary" : "outline"}>{approved ? "Approved" : "Pending"}</Badge>
                {!approved && (
                  <>
                    <Button size="sm" onClick={() => {
                      useNaflis.getState().approveCredit(user.id, 3000);
                      toast.success(`Approved GHS 3,000 credit for ${user.name}`);
                    }}>Approve GHS 3,000</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      useNaflis.getState().declineCredit(user.id, "Insufficient repayment history.");
                      toast.success("Application declined");
                    }}>Decline</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="escrow" className="mt-4 space-y-2">
          {orders.filter((o) => ["escrow-secured", "seller-accepted", "preparing", "out-for-delivery"].includes(o.status)).map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <p className="text-xs text-muted-foreground">Order #{o.id.slice(2, 10)} · {fmtDate(o.createdAt)}</p>
                <p className="font-semibold">{GHS(o.total)} held</p>
              </div>
              <Badge variant="secondary" className="capitalize">{o.status.replaceAll("-", " ")}</Badge>
            </div>
          ))}
          {orders.filter((o) => ["escrow-secured", "seller-accepted", "preparing", "out-for-delivery"].includes(o.status)).length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No escrow currently held.</p>
          )}
        </TabsContent>

        <TabsContent value="refunds" className="mt-4 space-y-2">
          {refundQueue.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No refunds queued.</p>
          ) : refundQueue.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <p className="text-xs text-muted-foreground">Order #{o.id.slice(2, 10)}</p>
                <p className="font-semibold">{GHS(o.total)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { toast.success("Refund processed"); }}>
                <RefreshCw className="mr-1 h-4 w-4" /> Process refund
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="settlements" className="mt-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="font-semibold">Seller settlements</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Auto-settle every 24 hours after successful delivery. Manual approval required over GHS 10,000.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Due today</p>
                <p className="text-lg font-bold">{GHS(12800)}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Held (review)</p>
                <p className="text-lg font-bold">{GHS(4200)}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Paid (30d)</p>
                <p className="text-lg font-bold">{GHS(384000)}</p>
              </div>
            </div>
            <Button className="mt-4" onClick={() => toast.success("Settlements approved and queued")}>
              <ArrowUpRight className="mr-1 h-4 w-4" /> Approve today's settlements
            </Button>
          </div>
          {activePlans.length > 0 && (
            <div className="mt-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-warning" />
                <p className="font-semibold">Installment exposure</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {activePlans.length} active plan(s) · outstanding {GHS(outstandingCredit)}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </RoleShell>
  );
}
