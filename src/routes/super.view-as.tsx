import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, GraduationCap, Loader2, ShieldAlert, ShoppingBag, Store, Building2 } from "lucide-react";
import { toast } from "sonner";
import { RoleShell } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { ROLE_META, normalizeRole, resolveRoles, roleHome, type Role } from "@/lib/naflis/roles";
import { useNaflis, type User } from "@/lib/naflis/store";
import { startViewAs } from "@/services/staffService";

export const Route = createFileRoute("/super/view-as")({
  component: ViewAsConsole,
});

const ROLES: { role: Role; label: string; icon: typeof Eye }[] = [
  { role: "buyer", label: "Buyer", icon: ShoppingBag },
  { role: "student", label: "Student", icon: GraduationCap },
  { role: "seller", label: "Seller", icon: Store },
  { role: "src_head", label: "SRC member", icon: Building2 },
  { role: "dean", label: "Dean / Staff", icon: Building2 },
];

function ViewAsConsole() {
  const navigate = useNavigate();
  const users = useNaflis((s) => s.users);
  const stores = useNaflis((s) => s.stores);
  const grants = useNaflis((s) => s.staffGrants);
  const sessions = useNaflis((s) => s.impersonationSessions);
  const [role, setRole] = useState<Role>("buyer");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // With Supabase, list real accounts too (profiles are publicly readable).
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, role, roles, institution_id")
      .limit(200)
      .then(({ data }) => {
        if (!data?.length) return;
        useNaflis.setState((s) => {
          const known = new Set(s.users.map((u) => u.id));
          const extra: User[] = data
            .filter((p: any) => !known.has(p.id))
            .map((p: any) => ({
              id: p.id, name: p.full_name || p.email, email: p.email, phone: p.phone ?? "", region: "Greater Accra",
              role: normalizeRole(p.role), roles: (p.roles ?? []).map(normalizeRole), institutionId: p.institution_id ?? undefined,
              avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${p.id}`, verified: true,
            }));
          return extra.length ? { users: [...s.users, ...extra] } : {};
        });
      });
  }, []);

  const candidates = useMemo(
    () =>
      users
        .map((u) => ({ user: u, roles: resolveRoles(u, stores) }))
        .filter(({ roles }) => roles.includes(role) && !roles.includes("super_admin"))
        .filter(({ user }) => !q.trim() || `${user.name} ${user.email}`.toLowerCase().includes(q.toLowerCase())),
    [users, stores, role, q],
  );
  const contextFor = (u: User) => {
    if (role === "seller") return stores.find((s) => s.ownerId === u.id)?.name ?? "No shop yet";
    const g = grants.find((x) => x.userId === u.id && x.status === "active");
    if ((role === "src_head" || role === "dean") && g) return `${g.title} · ${g.campusId === "*" ? g.institutionId.toUpperCase() : g.campusId}`;
    return u.institutionId ?? u.region;
  };

  const start = async () => {
    if (!targetId) return;
    setBusy(true);
    const res = await startViewAs({ targetUserId: targetId, role, reason, minutes });
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    toast.warning(res.message);
    navigate({ to: roleHome(role) });
  };

  return (
    <RoleShell title="View As" subtitle="See the platform exactly as a buyer, student, seller or SRC member sees it. Every session is logged." icon={Eye} badge="Audited">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/super"><ArrowLeft className="mr-1 h-4 w-4" /> Engine room</Link>
      </Button>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          View-As changes what this app shows, not who you are to the server: requests still carry your own admin session, nothing is
          signed in as the user, and payments are blocked while a view is active. Sessions end automatically after the time limit.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.role}
                  onClick={() => { setRole(r.role); setTargetId(null); }}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${role === r.role ? "border-sky-500 bg-sky-500 text-white" : "hover:bg-muted"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {r.label}
                </button>
              );
            })}
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="max-w-sm" />
          <div className="divide-y rounded-xl border bg-card">
            {candidates.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No {ROLE_META[role].label.toLowerCase()} accounts found.</p>}
            {candidates.map(({ user }) => (
              <label key={user.id} className={`flex cursor-pointer items-center gap-3 p-3 ${targetId === user.id ? "bg-sky-500/5" : "hover:bg-muted"}`}>
                <input type="radio" name="target" className="accent-sky-500" checked={targetId === user.id} onChange={() => setTargetId(user.id)} />
                <img src={user.avatar} alt="" className="h-8 w-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <span className="truncate text-xs text-muted-foreground">{contextFor(user)}</span>
              </label>
            ))}
          </div>
        </section>

        <aside className="h-fit space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-bold">Start session</h2>
          <div className="space-y-1">
            <Label className="text-xs">Reason (recorded in the audit log)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Support ticket #4821 — checkout issue" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ends automatically after</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          <Button className="w-full" disabled={!targetId || reason.trim().length < 5 || busy} onClick={start}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            View as {ROLE_META[role].label}
          </Button>
        </aside>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 font-bold">Session log</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">Admin</th>
                <th className="p-2.5 font-medium">Viewed as</th>
                <th className="p-2.5 font-medium">Context</th>
                <th className="p-2.5 font-medium">Reason</th>
                <th className="p-2.5 font-medium">Started</th>
                <th className="p-2.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No sessions yet.</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2.5">{s.adminName}</td>
                  <td className="p-2.5">{s.targetName} <Badge variant="outline" className="ml-1">{ROLE_META[s.role].label}</Badge></td>
                  <td className="p-2.5">{s.context}</td>
                  <td className="max-w-56 truncate p-2.5" title={s.reason}>{s.reason}</td>
                  <td className="p-2.5">{new Date(s.startedAt).toLocaleString("en-GH")}</td>
                  <td className="p-2.5">
                    {s.endedAt ? `${Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000))} min${s.endReason === "expired" ? " (expired)" : ""}` : <Badge>Active</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </RoleShell>
  );
}
