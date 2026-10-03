import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Building2, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/naflis/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNaflis } from "@/lib/naflis/store";
import { PERMISSION_LABEL, scopeLabel, type Permission } from "@/lib/naflis/permissions";
import { acceptInvite, previewInvite } from "@/services/staffService";

export const Route = createFileRoute("/staff-invite")({
  validateSearch: z.object({ token: z.string().optional() }).parse,
  component: StaffInvite,
});

type Preview = Awaited<ReturnType<typeof previewInvite>>;

function StaffInvite() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) previewInvite(token).then(setPreview);
  }, [token]);

  const invite = preview?.ok ? preview.data : undefined;
  const expired = invite?.expiresAt !== undefined && invite.expiresAt < Date.now();
  const wrongAccount = invite && user && user.email.toLowerCase() !== invite.email.toLowerCase();

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    const res = await acceptInvite(token);
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    toast.success(res.message);
    navigate({ to: "/campus-admin" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b"><div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Logo /></div></header>
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <h1 className="flex items-center gap-2 text-xl font-black"><Building2 className="h-5 w-5 text-sky-500" /> Staff invitation</h1>
          {!token && <p className="text-sm text-muted-foreground">This link is missing its invitation token.</p>}
          {token && !preview && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking invitation…</p>}
          {preview && !preview.ok && <p className="flex items-center gap-2 text-sm text-error"><XCircle className="h-4 w-4" /> {preview.message}</p>}
          {invite && (
            <>
              <div className="space-y-1 text-sm">
                <p><b>{invite.title}</b></p>
                <p className="text-muted-foreground">{scopeLabel(invite)}</p>
                <p className="text-xs text-muted-foreground">Sent to {invite.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You'll be able to</p>
                {invite.permissions.map((p) => (
                  <p key={p} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> {PERMISSION_LABEL[p as Permission] ?? p}</p>
                ))}
              </div>
              <p className="flex items-start gap-1.5 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" /> Access is limited to this scope. You won't see other institutions' content.
              </p>
              {invite.status !== "invited" ? (
                <Badge variant="secondary" className="capitalize">Invitation {invite.status}</Badge>
              ) : expired ? (
                <p className="text-sm text-error">This invitation has expired. Ask your Super Admin for a new one.</p>
              ) : !user ? (
                <Button asChild className="w-full"><Link to="/login" search={{ redirect: `/staff-invite?token=${token}` }}>Sign in as {invite.email} to accept</Link></Button>
              ) : wrongAccount ? (
                <p className="text-sm text-error">You're signed in as {user.email}. Sign in with {invite.email} to accept.</p>
              ) : (
                <Button className="w-full" onClick={accept} disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Accept invitation</Button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
