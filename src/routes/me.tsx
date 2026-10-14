import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronRight, LayoutDashboard, LogOut, PlusCircle, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROLE_ICONS, useWorkspaces } from "@/components/naflis/ContextSwitcher";
import { StudentVerificationModal } from "@/components/naflis/StudentVerificationModal";
import { AppShell, PAGE_WIDTH } from "@/components/naflis/shell/AppShell";
import { PLACES, type Destination, type FlagKey } from "@/components/naflis/shell/places";
import { STAFF_ROLES, useSignOut } from "@/components/naflis/shell/UserMenu";
import { useFeatureFlag } from "@/lib/featureFlags";
import { ROLE_META } from "@/lib/naflis/roles";
import { useNaflis, useUserRoles } from "@/lib/naflis/store";

// "Me": the account hub, and the one place on a phone that lists every
// destination the old "More" sheet and sidebars offered.
export const Route = createFileRoute("/me")({
  component: MePage,
});

function useFlags(): Record<FlagKey, boolean> {
  return {
    student_os: useFeatureFlag("student_os"),
    src_portal: useFeatureFlag("src_portal"),
    reserve_and_pay: useFeatureFlag("reserve_and_pay"),
    take_now_pay_later: useFeatureFlag("take_now_pay_later"),
  };
}

function Row({ icon: Icon, label, hint, to, onClick, active }: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {active ? <span className="text-xs font-bold text-primary">Current</span> : <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />}
    </>
  );
  const cls = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-accent";
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border-soft bg-card p-2 shadow-soft">
      <h2 className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function MePage() {
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const verified = useNaflis((s) => s.studentProfile.isVerified);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const held = useUserRoles();
  const ws = useWorkspaces();
  const signOut = useSignOut();
  const flags = useFlags();
  const signedIn = Boolean(user);

  const visible = (d: Destination) => (!d.flag || flags[d.flag]) && (!d.signedIn || signedIn);
  const place = (id: "me" | "shop" | "campus" | "home") => PLACES.find((p) => p.id === id)!.destinations.filter(visible);
  const staff = held.filter((r) => STAFF_ROLES.includes(r));

  return (
    <AppShell showCampus={false}>
      <main className={`${PAGE_WIDTH} py-6`}>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Me</h1>
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <div className="space-y-4">
            <section className="rounded-3xl border border-border-soft bg-card p-5 shadow-soft">
              {user ? (
                <div className="flex items-center gap-4">
                  <img src={user.avatar} alt="" className="h-16 w-16 rounded-full bg-muted object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{user.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    {verified ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-tile-mint px-2.5 py-1 text-xs font-bold text-verified">
                        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.8} /> Verified student
                      </span>
                    ) : (
                      flags.student_os && (
                        <button type="button" onClick={() => setVerifyModalOpen(true)}
                          className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-bold text-accent-foreground">
                          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} /> Verify student ID
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-extrabold">You're not signed in</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sign in to see your wallet, orders and listings.</p>
                  <Link to="/login" className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-deep">
                    Sign in
                  </Link>
                </div>
              )}
            </section>
            {place("me").length > 0 && (
              <Group title="My account">{place("me").map((d) => <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />)}</Group>
            )}
            {signedIn && (staff.length > 0 || ws.roles.length > 1 || ws.canJoinStudentOs) && (
              <Group title="Workspaces & access">
                {staff.map((r) => (
                  <Row key={`dash-${r}`} icon={LayoutDashboard} label={`${ROLE_META[r].label} dashboard`} hint={ROLE_META[r].description} onClick={() => ws.switchTo(r)} />
                ))}
                {ws.roles.length > 1 && ws.roles.filter((r) => !STAFF_ROLES.includes(r)).map((r) => (
                  <Row key={r} icon={ROLE_ICONS[r]} label={ROLE_META[r].label} hint={ROLE_META[r].description} active={r === ws.active} onClick={() => ws.switchTo(r)} />
                ))}
                {ws.canJoinStudentOs && <Row icon={PlusCircle} label="Join Student OS" onClick={ws.joinStudentOs} />}
              </Group>
            )}
          </div>
          <div className="space-y-4">
            <Group title="Shop">{place("shop").map((d) => <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />)}</Group>
            {place("campus").length > 0 && (
              <Group title="Campus">{place("campus").map((d) => <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />)}</Group>
            )}
            {place("home").length > 1 && (
              <Group title="More">{place("home").slice(1).map((d) => <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />)}</Group>
            )}
            {signedIn && (
              <Group title="Session">
                <Row icon={LogOut} label="Sign out" onClick={signOut} />
              </Group>
            )}
          </div>
        </div>
      </main>
      <StudentVerificationModal />
    </AppShell>
  );
}
