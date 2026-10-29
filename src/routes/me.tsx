import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  PlusCircle,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ROLE_ICONS, useWorkspaces } from "@/components/naflis/ContextSwitcher";
import { StudentVerificationModal } from "@/components/naflis/StudentVerificationModal";
import { ListingImage } from "@/components/naflis/home/HomeBlocks";
import { AppShell, PAGE_WIDTH, useViewer } from "@/components/naflis/shell/AppShell";
import { placesFor, type FlagKey } from "@/components/naflis/shell/places";
import { STAFF_ROLES, useSignOut } from "@/components/naflis/shell/UserMenu";
import { useFeatureFlag } from "@/lib/featureFlags";
import { GHS } from "@/lib/naflis/format";
import { orderStateLabel } from "@/lib/naflis/orderMachine";
import { ROLE_META, isInstitutionalRole, roleHome } from "@/lib/naflis/roles";
import { IS_LIVE, hiddenInLive } from "@/lib/appMode";
import { useNaflis, useUserRoles, useWallet } from "@/lib/naflis/store";
import { runOrderTransition } from "@/services/orderService";
import { saveStudentProfile } from "@/services/studentProfile";
import { StudentQuestion } from "@/components/naflis/StudentQuestion";
import { studentAnswerError, type StudentAnswer } from "@/lib/naflis/studentAnswer";

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

function Row({
  icon: Icon,
  label,
  hint,
  to,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-link">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {active ? (
        <span className="text-xs font-bold text-link">Current</span>
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
      )}
    </>
  );
  const cls =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-accent";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** "Are you a student?" on /me: lets an existing account opt in or out. Display only. */
function StudentDetailsCard({ isStudent, campus }: { isStudent: boolean; campus: string }) {
  const [answer, setAnswer] = useState<StudentAnswer>({ isStudent, campus });
  const [saving, setSaving] = useState(false);
  const changed = answer.isStudent !== isStudent || answer.campus !== campus;
  const save = async () => {
    const problem = studentAnswerError(answer);
    if (problem) return void toast.error(problem);
    setSaving(true);
    try {
      await saveStudentProfile({ isStudent: answer.isStudent === true, campus: answer.campus });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-4 rounded-3xl border border-border-soft bg-card p-5 shadow-soft">
      <StudentQuestion value={answer} onChange={setAnswer} />
      <p className="text-xs text-muted-foreground">
        Students also get campus tools and see their own campus first. It doesn't change what you
        can do on NAFLIS Mall.
      </p>
      {changed && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border-soft bg-card p-2 shadow-soft">
      <h2 className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/** Wallet summary: real balances, Top up only (the top-up form lives on the wallet page). */
function WalletCard() {
  const wallet = useWallet();
  if (!wallet) return null;
  return (
    <section className="rounded-[30px] gradient-hero p-5 text-white shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Wallet className="h-4 w-4" strokeWidth={1.8} /> NAFLIS Wallet
        </p>
        <Link
          to="/buyer/wallet"
          className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-semibold text-white underline-offset-4 hover:underline"
        >
          Details
        </Link>
      </div>
      <p className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {GHS(wallet.balance)}
      </p>
      <p className="text-xs text-white">Available balance · {GHS(wallet.escrow)} held in escrow</p>
      <Link
        to="/buyer/wallet"
        className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-5 text-sm font-bold text-primary-deep shadow-soft hover:bg-white/90"
      >
        <Plus className="h-4 w-4" strokeWidth={1.8} /> Top up
      </Link>
    </section>
  );
}

const DONE = ["completed", "cancelled", "refunded"];
const STEPS = ["paid", "accepted", "processing", "ready", "dispatched", "delivered"];

/** The buyer's most recent order still in progress, with the same actions the order page offers. */
function ActiveOrderCard() {
  const order = useNaflis(
    (s) =>
      s.orders
        .filter((o) => o.buyerId === s.currentUserId && !DONE.includes(o.status))
        .sort((a, b) => b.createdAt - a.createdAt)[0],
  );
  const products = useNaflis((s) => s.products);
  const advance = useNaflis((s) => s.advanceOrder);
  const pushNotif = useNaflis((s) => s.pushNotif);

  if (!order) {
    return (
      <section className="rounded-3xl border border-border-soft bg-card p-6 text-center shadow-soft">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-tile-brand text-tile-brand-icon">
          <Package className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h2 className="mt-3 text-lg font-extrabold">No active order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          When you buy something, you can follow it here until it reaches you.
        </p>
        <Link
          to="/buyer"
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-deep"
        >
          <Store className="h-4 w-4" strokeWidth={1.8} /> Go to Shop
        </Link>
      </section>
    );
  }

  const first = products.find((p) => p.id === order.items[0]?.productId);
  const more = order.items.length - 1;
  const step = STEPS.indexOf(order.status);

  const confirmReceived = async () => {
    const res = await runOrderTransition(order.id, "completed", () =>
      advance(
        order.id,
        "completed",
        "Buyer confirmed delivery — escrow released to seller",
        "buyer",
      ),
    );
    if (!res.ok) return toast.error(res.message);
    pushNotif({
      userId: order.buyerId,
      type: "escrow",
      title: "Escrow released",
      body: "Funds released to seller — thanks for confirming.",
    });
    toast.success("Delivery confirmed. Funds released to seller.");
  };

  return (
    <section className="rounded-3xl border border-border-soft bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Active order
        </h2>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-link">
          {orderStateLabel(order.status)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
          <ListingImage src={first?.image} alt="" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">
            {first?.name ?? `Order #${order.id.slice(2, 10)}`}
            {more > 0 ? ` + ${more} more` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Order #{order.id.slice(2, 10)} · {GHS(order.total)}
          </p>
        </div>
      </div>
      {step >= 0 && (
        <div
          className="mt-4 flex gap-1"
          aria-label={`Step ${step + 1} of ${STEPS.length}: ${orderStateLabel(order.status)}`}
        >
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
      )}
      <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" strokeWidth={1.8} />
        Your payment stays in escrow until you confirm you've received the order.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {order.status === "delivered" && (
          <button
            type="button"
            onClick={confirmReceived}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft hover:bg-primary-deep"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> I've received my order
          </button>
        )}
        <Link
          to="/buyer/orders/$orderId"
          params={{ orderId: order.id }}
          className="inline-flex h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-accent"
        >
          Track order
        </Link>
        <Link
          to="/buyer/messages"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-accent"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.8} /> Message seller
        </Link>
      </div>
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
  // Live: the student's own campus (profile field); demo: the verified or picked campus.
  const pickedCampus = useNaflis((s) => s.registeredInstitution ?? s.selectedCampus);
  const campus = IS_LIVE ? user?.studentCampus : pickedCampus;

  // Same rules as the menus: Student OS (Campus, the Student OS link) only for signed-in students.
  const viewer = useViewer();
  const isStudent = viewer.isStudent;
  const places = placesFor(viewer);
  const place = (id: "me" | "shop" | "campus" | "home") =>
    places.find((p) => p.id === id)?.destinations ?? [];
  // Live: no dashboards that run on in-browser data only (appMode LIVE_HIDDEN_PATHS).
  // Institutional portals are reached by their own URL, never from this page.
  const staff = held.filter(
    (r) => STAFF_ROLES.includes(r) && !isInstitutionalRole(r) && !hiddenInLive(roleHome(r)),
  );

  return (
    <AppShell showCampus={false}>
      <main className={`${PAGE_WIDTH} py-6`}>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight md:text-3xl">Me</h1>
        <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-6">
          <div className="space-y-4 md:sticky md:top-24">
            <section className="rounded-3xl border border-border-soft bg-card p-5 shadow-soft">
              {user ? (
                <div className="flex items-center gap-4">
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-16 w-16 rounded-full bg-muted object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{user.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    {campus && isStudent && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> {campus}
                      </p>
                    )}
                    {/* Live: verification isn't saved server-side yet, so no badge and no Verify button. */}
                    {IS_LIVE ? null : verified ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-tile-mint px-2.5 py-1 text-xs font-bold text-verified">
                        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.8} /> Verified student
                      </span>
                    ) : (
                      flags.student_os && (
                        <button
                          type="button"
                          onClick={() => setVerifyModalOpen(true)}
                          className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-bold text-accent-foreground"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} /> Verify student
                          ID
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-extrabold">You're not signed in</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {IS_LIVE ? "Sign in to post listings and manage your account." : "Sign in to see your wallet, orders and listings."}
                  </p>
                  <Link
                    to="/login"
                    className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-deep"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </section>
            {/* Live: the self-declared student answer (display only). */}
            {signedIn && IS_LIVE && user && (
              <StudentDetailsCard
                key={user.id}
                isStudent={Boolean(user.isStudent)}
                campus={user.studentCampus ?? ""}
              />
            )}
            {/* Demo only: wallet and orders run on in-browser data. */}
            {signedIn && !IS_LIVE && <WalletCard />}
          </div>
          <div className="space-y-4">
            {signedIn && !IS_LIVE && <ActiveOrderCard />}
            {place("me").length > 0 && (
              <Group title="My account">
                {place("me").map((d) => (
                  <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />
                ))}
              </Group>
            )}
            {signedIn && (staff.length > 0 || ws.roles.length > 1 || ws.canJoinStudentOs) && (
              <Group title="Workspaces & access">
                {staff.map((r) => (
                  <Row
                    key={`dash-${r}`}
                    icon={LayoutDashboard}
                    label={`${ROLE_META[r].label} dashboard`}
                    hint={ROLE_META[r].description}
                    onClick={() => ws.switchTo(r)}
                  />
                ))}
                {ws.roles.length > 1 &&
                  ws.roles
                    .filter((r) => !STAFF_ROLES.includes(r))
                    .map((r) => (
                      <Row
                        key={r}
                        icon={ROLE_ICONS[r]}
                        label={ROLE_META[r].label}
                        hint={ROLE_META[r].description}
                        active={r === ws.active}
                        onClick={() => ws.switchTo(r)}
                      />
                    ))}
                {ws.canJoinStudentOs && (
                  <Row icon={PlusCircle} label="Join Student OS" onClick={ws.joinStudentOs} />
                )}
              </Group>
            )}
            <Group title="Shop">
              {place("shop").map((d) => (
                <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />
              ))}
            </Group>
            {place("campus").length > 0 && (
              <Group title="Campus">
                {place("campus").map((d) => (
                  <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />
                ))}
              </Group>
            )}
            {place("home").length > 1 && (
              <Group title="More">
                {place("home")
                  .slice(1)
                  .map((d) => (
                    <Row key={d.to} icon={d.icon} label={d.label} to={d.to} />
                  ))}
              </Group>
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
