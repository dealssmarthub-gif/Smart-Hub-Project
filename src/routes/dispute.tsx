import { createFileRoute, redirect } from "@tanstack/react-router";
import { Shield, AlertTriangle, CheckCircle2, Split } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useNaflis } from "@/lib/naflis/store";
import { GHS, fmtDate, uid } from "@/lib/naflis/format";

export const Route = createFileRoute("/dispute")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "dispute") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/dispute",
        },
      });
    }
  },
  component: DisputeDashboard,
});

function DisputeDashboard() {
  const orders = useNaflis((s) => s.orders);
  const disputes = useNaflis((s) => s.disputes);
  const users = useNaflis((s) => s.users);

  const eligible = useMemo(
    () => orders.filter((o) => ["delivered", "funds-released", "out-for-delivery"].includes(o.status) && !disputes.some((d) => d.orderId === o.id)),
    [orders, disputes],
  );

  const open = disputes.filter((d) => d.status !== "resolved");
  const resolved = disputes.filter((d) => d.status === "resolved");

  const openDisputeAction = useNaflis((s) => s.openDispute);
  function seedDispute(orderId: string) {
    const d = openDisputeAction({
      orderId,
      reason: "Item not as described",
      description: "Buyer reports the item differs from listing photos. Requesting review.",
      evidence: ["photo-1.jpg", "photo-2.jpg", "delivery-proof.pdf"],
    });
    if (d) toast.success("Dispute filed — escrow frozen, all parties notified");
    else toast.error("Order already has an open dispute");
  }

  return (
    <RoleShell
      title="Dispute Resolution"
      subtitle="Review evidence and split escrow, refund, release, or escalate."
      icon={Shield}
      badge={`${open.length} open`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open cases" value={String(open.length)} />
        <MetricCard label="Resolved" value={String(resolved.length)} hint="This session" />
        <MetricCard label="Escalated" value={String(disputes.filter((d) => d.status === "escalated").length)} />
        <MetricCard label="Eligible orders" value={String(eligible.length)} hint="Can be disputed" />
      </div>

      {eligible.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Seed a demo dispute from a delivered order</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eligible.slice(0, 3).map((o) => (
              <Button key={o.id} variant="outline" size="sm" onClick={() => seedDispute(o.id)}>
                Dispute order #{o.id.slice(2, 8)} ({GHS(o.total)})
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {disputes.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No disputes yet. Deliver an order first, then open one above.</p>
          </div>
        ) : (
          disputes.map((d) => {
            const order = orders.find((o) => o.id === d.orderId);
            const buyer = users.find((u) => u.id === d.buyerId);
            return <DisputeCard key={d.id} dispute={d} order={order} buyerName={buyer?.name ?? "Buyer"} />;
          })
        )}
      </div>
    </RoleShell>
  );
}

function DisputeCard({ dispute, order, buyerName }: { dispute: ReturnType<typeof useNaflis.getState>["disputes"][number]; order?: ReturnType<typeof useNaflis.getState>["orders"][number]; buyerName: string }) {
  const [note, setNote] = useState("");
  const [splitPct, setSplitPct] = useState(50);
  const resolveDispute = useNaflis((s) => s.resolveDispute);
  const resolved = dispute.status === "resolved";

  function resolve(kind: "full-refund" | "release" | "split" | "escalate") {
    resolveDispute(dispute.id, kind, { splitPct, note: note || undefined });
    toast.success(kind === "escalate" ? "Escalated to administrator" : `Dispute resolved · ${kind.replace("-", " ")}`);
  }


  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${resolved ? "text-muted-foreground" : "text-error"}`} />
            <p className="font-semibold">Case #{dispute.id.slice(2, 10)}</p>
            <Badge variant={resolved ? "secondary" : "destructive"} className="capitalize">{dispute.status.replaceAll("-", " ")}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Filed by {buyerName} · {fmtDate(dispute.createdAt)} · Order {dispute.orderId.slice(2, 10)} · {order ? GHS(order.total) : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</p>
          <p className="mt-1 text-sm font-semibold">{dispute.reason}</p>
          <p className="mt-2 text-sm text-muted-foreground">{dispute.description}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence</p>
          <ul className="mt-1 space-y-1 text-sm">
            {dispute.evidence.map((e) => (
              <li key={e} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{e}</li>
            ))}
          </ul>
        </div>
      </div>

      {resolved ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-success/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {dispute.resolution}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <Textarea placeholder="Internal resolution note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => resolve("full-refund")}>Full refund to buyer</Button>
            <Button size="sm" variant="outline" onClick={() => resolve("release")}>Release to seller</Button>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1">
              <Split className="h-4 w-4 text-sky-500" />
              <input type="range" min={10} max={90} step={5} value={splitPct} onChange={(e) => setSplitPct(Number(e.target.value))} />
              <span className="w-16 text-xs font-semibold">Buyer {splitPct}%</span>
              <Button size="sm" onClick={() => resolve("split")}>Split escrow</Button>
            </div>
            <Button size="sm" variant="destructive" onClick={() => resolve("escalate")}>Escalate</Button>
          </div>
        </div>
      )}
    </div>
  );
}
