import { createFileRoute, redirect } from "@tanstack/react-router";
import { LayoutDashboard, Activity, ShieldAlert, Users, Package } from "lucide-react";
import { useMemo } from "react";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, compact, fmtDate, fmtTime } from "@/lib/naflis/format";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "admin" && role !== "super") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/admin",
        },
      });
    }
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const orders = useNaflis((s) => s.orders);
  const users = useNaflis((s) => s.users);
  const products = useNaflis((s) => s.products);
  const disputes = useNaflis((s) => s.disputes);
  const audit = useNaflis((s) => s.auditLog);
  const wallets = useNaflis((s) => s.wallets);
  const stores = useNaflis((s) => s.stores);

  const gmv = orders.reduce((a, o) => a + o.total, 0);
  const escrow = Object.values(wallets).reduce((a, w) => a + w.escrow, 0);
  const buyers = users.filter((u) => u.role === "buyer").length;
  const openDisputes = disputes.filter((d) => d.status !== "resolved").length;

  const categoryDist = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => { m[p.category] = (m[p.category] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [products]);
  const maxCat = Math.max(1, ...categoryDist.map(([, v]) => v));

  const fraudAlerts = [
    { id: 1, severity: "high", label: "Multiple failed logins from IP 41.66.•.•", subject: "u_buyer2" },
    { id: 2, severity: "medium", label: "New seller listing 4× market average discount", subject: "u_seller3" },
    { id: 3, severity: "low", label: "Wallet top-up velocity above threshold", subject: "u_buyer3" },
  ];

  return (
    <RoleShell
      title="Platform Administrator"
      subtitle="Cross-platform visibility — GMV, escrow, disputes, users, fraud, and audit."
      icon={LayoutDashboard}
      badge="Live"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="GMV" value={GHS(gmv)} hint={`${orders.length} orders`} />
        <MetricCard label="Escrow balance" value={GHS(escrow)} hint="Currently held" />
        <MetricCard label="Buyers" value={compact(buyers)} hint={`${users.filter((u) => u.role === "seller").length} sellers`} />
        <MetricCard label="Open disputes" value={String(openDisputes)} hint={`${fraudAlerts.length} fraud alerts`} />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="stores">Stores</TabsTrigger>
          <TabsTrigger value="fraud">Fraud</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-sky-500" />
              <p className="font-semibold">Catalog distribution</p>
            </div>
            <ul className="mt-3 space-y-2">
              {categoryDist.map(([cat, count]) => (
                <li key={cat} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate">{cat}</span>
                  <Progress value={(count / maxCat) * 100} className="flex-1" />
                  <span className="w-8 text-right text-xs font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-500" />
              <p className="font-semibold">Order pipeline</p>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                "escrow-secured",
                "seller-accepted",
                "preparing",
                "out-for-delivery",
                "delivered",
                "funds-released",
                "refund-approved",
              ].map((status) => {
                const n = orders.filter((o) => o.status === status).length;
                return (
                  <li key={status} className="flex items-center justify-between">
                    <span className="capitalize">{status.replaceAll("-", " ")}</span>
                    <Badge variant="secondary">{n}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <img src={u.avatar} alt="" className="h-10 w-10 rounded-full border" />
                <div>
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · {u.region}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{u.role}</Badge>
                {u.verified ? <Badge className="bg-success text-success-foreground">Verified</Badge> : <Badge variant="destructive">Unverified</Badge>}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="stores" className="mt-4 space-y-2">
          {stores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <img src={s.logo} alt="" className="h-10 w-10 rounded-full border" />
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.location} · {s.followers.toLocaleString()} followers · ★ {s.rating}</p>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">{s.subscription}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="fraud" className="mt-4 space-y-2">
          {fraudAlerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className={`h-5 w-5 ${a.severity === "high" ? "text-error" : a.severity === "medium" ? "text-warning" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-semibold">{a.label}</p>
                  <p className="text-xs text-muted-foreground">Subject: {a.subject}</p>
                </div>
              </div>
              <Badge variant={a.severity === "high" ? "destructive" : "secondary"} className="capitalize">{a.severity}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          {audit.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Audit log is empty. Perform some actions across the platform to see them appear here in real time.
            </p>
          ) : (
            <div className="rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Time</th>
                    <th className="p-3 text-left">Actor</th>
                    <th className="p-3 text-left">Action</th>
                    <th className="p-3 text-left">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(0, 50).map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="p-3 text-xs text-muted-foreground">{fmtDate(e.at)} {fmtTime(e.at)}</td>
                      <td className="p-3">{e.actor}</td>
                      <td className="p-3 font-mono text-xs">{e.action}</td>
                      <td className="p-3 font-mono text-xs">{e.target ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> All metrics reflect live demo state. Reset from the Investor Demo drawer.
      </p>
    </RoleShell>
  );
}
