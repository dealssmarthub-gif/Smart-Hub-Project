import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { RoleShell } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNaflis } from "@/lib/naflis/store";
import { fmtDate } from "@/lib/naflis/format";
import {
  ALL_CAMPUSES,
  INSTITUTIONS,
  PERMISSIONS,
  PERMISSION_LABEL,
  STAFF_TEMPLATES,
  scopeLabel,
  type Permission,
  type StaffGrant,
} from "@/lib/naflis/permissions";
import { inviteStaff, revokeStaff, updateStaffPermissions } from "@/services/staffService";

export const Route = createFileRoute("/super/staff")({
  component: StaffManagement,
});

const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";

function StaffManagement() {
  const grants = useNaflis((s) => s.staffGrants);
  const auditLog = useNaflis((s) => s.auditLog);
  const [instFilter, setInstFilter] = useState("all");

  const visible = grants
    .filter((g) => instFilter === "all" || g.institutionId === instFilter)
    .sort((a, b) => Number(a.status === "revoked") - Number(b.status === "revoked") || b.createdAt - a.createdAt);
  const staffAudit = auditLog.filter((a) => a.action.startsWith("staff.")).slice(0, 8);

  return (
    <RoleShell title="Staff & Permissions" subtitle="Invite institutional staff with permissions scoped to one institution and campus." icon={Users} badge="Super Admin">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/super"><ArrowLeft className="mr-1 h-4 w-4" /> Engine room</Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <InviteForm />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Staff ({visible.length})</h2>
            <select aria-label="Filter by institution" className="h-9 rounded-md border bg-background px-2 text-sm" value={instFilter} onChange={(e) => setInstFilter(e.target.value)}>
              <option value="all">All institutions</option>
              {INSTITUTIONS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
            Staff can only see and change content for their own institution — and only the campus in their scope. An SRC executive at one school
            can't touch another school's notices, events, tickets or timetables.
          </p>
          {visible.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No staff yet.</p>}
          {visible.map((g) => <GrantRow key={g.id} grant={g} />)}

          {staffAudit.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent staff changes</p>
              <ul className="space-y-1 text-xs">
                {staffAudit.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="font-mono">{a.action}</span>
                    <span className="truncate text-muted-foreground">{a.target}</span>
                    <span className="shrink-0 text-muted-foreground">{new Date(a.at).toLocaleString("en-GH")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </RoleShell>
  );
}

function InviteForm() {
  const [templateId, setTemplateId] = useState(STAFF_TEMPLATES[0].id);
  const template = STAFF_TEMPLATES.find((t) => t.id === templateId)!;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState(template.title);
  const [institutionId, setInstitutionId] = useState(INSTITUTIONS[0].id);
  const [campusId, setCampusId] = useState(INSTITUTIONS[0].campuses[0]);
  const [permissions, setPermissions] = useState<Permission[]>(template.permissions);
  const [expires, setExpires] = useState(7);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const institution = INSTITUTIONS.find((i) => i.id === institutionId)!;

  const pickTemplate = (id: string) => {
    const t = STAFF_TEMPLATES.find((x) => x.id === id)!;
    setTemplateId(id);
    setTitle(t.title);
    setPermissions(t.permissions);
  };
  const toggle = (p: Permission) => setPermissions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const submit = async () => {
    setBusy(true);
    setLink(null);
    const res = await inviteStaff({ email, name, title, role: template.role, institutionId, campusId, permissions, expiresInDays: expires });
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    toast.success(res.message);
    setLink(res.data!.link);
    setEmail("");
    setName("");
  };

  return (
    <section className="h-fit space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 font-bold"><UserPlus className="h-4 w-4 text-sky-500" /> Invite staff</h2>
      <div className="space-y-1">
        <Label className="text-xs">Role template</Label>
        <select className={select} value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
          {STAFF_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Mensah" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Email (they must sign in with this address)</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@src.ug.edu.gh" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Institution ID</Label>
          <select
            className={select}
            value={institutionId}
            onChange={(e) => {
              const inst = INSTITUTIONS.find((i) => i.id === e.target.value)!;
              setInstitutionId(inst.id);
              setCampusId(inst.campuses[0]);
            }}
          >
            {INSTITUTIONS.map((i) => <option key={i.id} value={i.id}>{i.id.toUpperCase()} — {i.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Campus ID</Label>
          <select className={select} value={campusId} onChange={(e) => setCampusId(e.target.value)}>
            {institution.campuses.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={ALL_CAMPUSES}>All {institution.id.toUpperCase()} campuses</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Permissions</Label>
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex cursor-pointer items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-sky-500" checked={permissions.includes(p)} onChange={() => toggle(p)} />
            <span>
              {PERMISSION_LABEL[p]} <span className="font-mono text-[10px] text-muted-foreground">{p}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Invite expires after</Label>
        <select className={select} value={expires} onChange={(e) => setExpires(Number(e.target.value))}>
          {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
        </select>
      </div>
      <Button className="w-full" onClick={submit} disabled={busy || !email.trim()}>
        {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create invitation
      </Button>

      {link && (
        <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold"><KeyRound className="h-3.5 w-3.5" /> One-time invite link</p>
          <p className="break-all font-mono text-[11px]">{link}</p>
          <p className="text-muted-foreground">Send it to the invitee securely. It's shown once — only a hash of the token is stored.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </section>
  );
}

function GrantRow({ grant }: { grant: StaffGrant }) {
  const [editing, setEditing] = useState(false);
  const [perms, setPerms] = useState<Permission[]>(grant.permissions);
  const expired = grant.status === "invited" && grant.expiresAt !== undefined && grant.expiresAt < Date.now();
  const status = expired ? "expired" : grant.status;
  const statusVariant = useMemo(() => (status === "active" ? "default" : status === "revoked" || status === "expired" ? "destructive" : "secondary"), [status]);

  return (
    <div className={`rounded-xl border bg-card p-4 ${grant.status === "revoked" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{grant.name} <span className="text-xs font-normal text-muted-foreground">· {grant.email}</span></p>
          <p className="text-xs text-muted-foreground">{grant.title} · {scopeLabel(grant)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} className="capitalize">{status}</Badge>
          {grant.status !== "revoked" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{editing ? "Cancel" : "Edit"}</Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  const r = await revokeStaff(grant.id);
                  r.ok ? toast.success(r.message) : toast.error(r.message);
                }}
              >
                Revoke
              </Button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-3 space-y-1.5">
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-sky-500" checked={perms.includes(p)} onChange={() => setPerms((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))} />
              {PERMISSION_LABEL[p]}
            </label>
          ))}
          <Button
            size="sm"
            onClick={async () => {
              const r = await updateStaffPermissions(grant.id, perms);
              if (!r.ok) return toast.error(r.message);
              toast.success(r.message);
              setEditing(false);
            }}
          >
            Save permissions
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {grant.permissions.map((p) => <Badge key={p} variant="outline" className="font-mono text-[10px]">{p}</Badge>)}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Invited {fmtDate(grant.createdAt)}
        {grant.acceptedAt && ` · accepted ${fmtDate(grant.acceptedAt)}`}
        {grant.status === "invited" && grant.expiresAt && ` · ${expired ? "expired" : "expires"} ${fmtDate(grant.expiresAt)}`}
        {grant.revokedAt && ` · revoked ${fmtDate(grant.revokedAt)}`}
      </p>
    </div>
  );
}
