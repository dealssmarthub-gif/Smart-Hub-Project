import { createFileRoute, redirect } from "@tanstack/react-router";
import { Crown, Flag, Globe, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/super")({
  beforeLoad: () => {
    const { role } = useNaflis.getState();
    if (role !== "super") {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/super",
        },
      });
    }
  },
  component: SuperDashboard,
});

const DEFAULT_FLAGS = [
  { key: "reserve_and_pay", label: "Reserve & Pay", desc: "Allow buyers to pre-pay in installments before delivery.", on: true },
  { key: "take_now_pay_later", label: "Take Now Pay Later", desc: "Credit-based instant purchase with repayment plan.", on: true },
  { key: "auto_settlements", label: "Auto Settlements", desc: "Automatically release seller funds 24h after delivery.", on: true },
  { key: "regional_flash_sales", label: "Regional Flash Sales", desc: "Show flash sales personalised by buyer region.", on: true },
  { key: "seller_ai_price_intel", label: "AI Price Intelligence", desc: "Enable AI-driven price recommendation for sellers.", on: true },
  { key: "brand_studio_beta", label: "Brand Studio (Beta)", desc: "Automated store & catalog generator (beta cohort).", on: false },
  { key: "fraud_hard_block", label: "Fraud Hard Block", desc: "Auto-suspend accounts with high risk score.", on: false },
];

const REGIONS = [
  { name: "Greater Accra", live: true, gmv: "GHS 3.4M" },
  { name: "Ashanti", live: true, gmv: "GHS 2.1M" },
  { name: "Western", live: true, gmv: "GHS 940K" },
  { name: "Central", live: true, gmv: "GHS 720K" },
  { name: "Northern", live: true, gmv: "GHS 480K" },
  { name: "Eastern", live: true, gmv: "GHS 610K" },
  { name: "Volta", live: false, gmv: "—" },
  { name: "Upper East", live: false, gmv: "—" },
];

function SuperDashboard() {
  const users = useNaflis((s) => s.users);
  const audit = useNaflis((s) => s.audit);
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [regionState, setRegionState] = useState(REGIONS);

  const admins = users.filter((u) => u.role === "admin" || u.role === "super" || u.role === "finance" || u.role === "dispute");

  return (
    <RoleShell
      title="Super Administrator"
      subtitle="Global oversight, feature flags, regional rollout, and platform policy."
      icon={Crown}
      badge="Root access"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Regions live" value={String(regionState.filter((r) => r.live).length)} hint={`of ${regionState.length}`} />
        <MetricCard label="Admin operators" value={String(admins.length)} />
        <MetricCard label="Feature flags on" value={String(flags.filter((f) => f.on).length)} hint={`of ${flags.length}`} />
        <MetricCard label="Policy version" value="v2026.7" hint="Effective July 15, 2026" />
      </div>

      <Tabs defaultValue="flags" className="mt-6">
        <TabsList>
          <TabsTrigger value="flags">Feature flags</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
          <TabsTrigger value="admins">Operators</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-4 space-y-2">
          {flags.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-sky-500" />
                  <p className="font-semibold">{f.label}</p>
                  <Badge variant={f.on ? "default" : "outline"}>{f.on ? "ON" : "OFF"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
              </div>
              <Switch
                checked={f.on}
                onCheckedChange={(v) => {
                  setFlags((cur) => cur.map((x) => x.key === f.key ? { ...x, on: v } : x));
                  audit(v ? "flag.enable" : "flag.disable", f.key);
                  toast.success(`${f.label} ${v ? "enabled" : "disabled"}`);
                }}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="regions" className="mt-4 grid gap-2 md:grid-cols-2">
          {regionState.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-sky-500" />
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">GMV 30d: {r.gmv}</p>
                </div>
              </div>
              <Switch
                checked={r.live}
                onCheckedChange={(v) => {
                  setRegionState((cur) => cur.map((x) => x.name === r.name ? { ...x, live: v } : x));
                  audit(v ? "region.enable" : "region.disable", r.name);
                  toast.success(`${r.name} ${v ? "went live" : "was paused"}`);
                }}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="admins" className="mt-4 space-y-2">
          {admins.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <img src={u.avatar} alt="" className="h-10 w-10 rounded-full border" />
                <div>
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <Badge className="capitalize" variant="outline">{u.role}</Badge>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="policy" className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            { title: "Escrow release", body: "Funds release 24h after buyer confirms delivery, or automatically 72h after courier confirmation with no dispute." },
            { title: "Verified discount", body: "Sellers must upload proof of prior selling price before discount over 15% is displayed as verified." },
            { title: "Credit underwriting", body: "Take Now Pay Later requires KYC + credit score ≥ 600 + wallet history ≥ 30 days." },
            { title: "Dispute SLA", body: "Officers must respond within 12h; resolution target 48h. Escalated cases go to admin queue." },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gold" />
                <p className="font-semibold">{p.title}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </RoleShell>
  );
}
