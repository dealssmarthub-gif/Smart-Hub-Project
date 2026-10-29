import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AlertCircle, Building2, Loader2 } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/naflis/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useNaflis } from "@/lib/naflis/store";
import { resolveRoles, staffRolesFor, staffTarget } from "@/lib/naflis/roles";
import { sessionReady } from "@/lib/sessionReady";

// The staff door: SRC branding only, no marketplace, and nothing links here.
// Signed-out (or non-staff) visits to /campus-admin and /super land here. It
// only signs people in and sends staff on; the portals' own guards and the
// database decide access.

export const Route = createFileRoute("/staff")({
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }).parse,
  head: () => ({ meta: [{ title: "SRC Staff sign-in" }, { name: "robots", content: "noindex" }] }),
  component: StaffSignIn,
});

type View = "checking" | "signin" | "denied";

function hasStaffAccess(target: string): boolean {
  const s = useNaflis.getState();
  if (s.impersonation) return false;
  const held = resolveRoles(s.users.find((u) => u.id === s.currentUserId));
  return held.some((r) => staffRolesFor(target).includes(r));
}

function StaffSignIn() {
  const search = Route.useSearch();
  const target = staffTarget(search.redirect);
  const navigate = useNavigate();
  const signOut = useNaflis((s) => s.signOut);
  const [view, setView] = useState<View>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const decide = () => {
    if (!useNaflis.getState().currentUserId) return setView("signin");
    if (hasStaffAccess(target)) return void navigate({ to: target, replace: true });
    setView("denied");
  };

  useEffect(() => {
    void sessionReady().then(decide);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return setError("Staff sign-in isn't available on this site.");
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err || !data.user) {
        setError(
          err?.message.toLowerCase().includes("email not confirmed")
            ? "Confirm your email first: check your inbox for the link."
            : "Wrong email or password.",
        );
        return;
      }
      await useNaflis.getState().completeSignIn(data.user);
      decide();
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await supabase?.auth.signOut().catch(() => undefined);
    signOut();
    setView("signin");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <main className="w-full max-w-sm space-y-6">
        <header className="space-y-3 text-center">
          {/* Not a link: this page has no way into the marketplace. */}
          <span className="flex items-center justify-center gap-2">
            <BrandMark className="h-10 w-10" />
            <Wordmark className="text-base" />
          </span>
          <h1 className="flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight">
            <Building2 className="h-6 w-6 text-link" strokeWidth={1.8} aria-hidden /> SRC Staff
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the email your staff invitation was sent to.
          </p>
        </header>

        {view === "checking" && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your session…
          </p>
        )}

        {view === "denied" && (
          <section className="space-y-4 rounded-3xl border border-border-soft bg-card p-6 text-center shadow-soft">
            <h2 className="text-lg font-extrabold">This account doesn't have staff access</h2>
            <p className="text-sm text-muted-foreground">
              Sign out and sign in with your staff account, or ask your Super Admin for an
              invitation.
            </p>
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={leave}>
              Sign out
            </Button>
          </section>
        )}

        {view === "signin" && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-3xl border border-border-soft bg-card p-6 shadow-soft"
          >
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            <Button type="submit" className="min-h-11 w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
