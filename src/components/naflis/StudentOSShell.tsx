import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  GraduationCap,
  Store,
  BadgePercent,
  BookOpen,
  CalendarDays,
  Briefcase,
  SearchCheck,
  Ticket,
  PlusCircle,
  Building2,
  ShieldCheck,
  CheckCircle2,
  ShoppingBag,
} from "lucide-react";
import { useNaflis } from "@/lib/naflis/store";
import { ListStudentItemModal } from "@/components/naflis/ListStudentItemModal";
import { StudentVerificationModal } from "@/components/naflis/StudentVerificationModal";
import { CampusSwitchPrompt, useSuggestRegisteredCampus } from "@/components/naflis/CampusContext";
import { AppShell, PAGE_WIDTH } from "@/components/naflis/shell/AppShell";

const TABS = [
  { to: "/student-os", label: "Hub Overview", icon: GraduationCap, exact: true },
  { to: "/student-os/marketplace", label: "Campus Marketplace", icon: Store },
  { to: "/student-os/deals", label: "Student Deals", icon: BadgePercent },
  { to: "/student-os/resources", label: "Resource Hub & Notes", icon: BookOpen },
  { to: "/student-os/calendar", label: "Academic Calendar", icon: CalendarDays },
  { to: "/student-os/events", label: "Events & Tickets", icon: Ticket },
  { to: "/student-os/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/student-os/lost-found", label: "Lost & Found", icon: SearchCheck },
  { to: "/campus-admin", label: "Institutional / SRC Access", icon: Building2 },
];

export function StudentOSShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const studentProfile = useNaflis((s) => s.studentProfile);
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const role = useNaflis((s) => s.role);
  useSuggestRegisteredCampus();

  const pill = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-bold transition ${
      active ? "bg-primary text-primary-foreground shadow-soft" : "bg-card text-subtle-foreground hover:bg-accent hover:text-accent-foreground"
    }`;

  return (
    <AppShell>
      {/* Student OS section bar: every Student OS page, plus verification and selling. */}
      <div className="border-b border-border-soft bg-background">
        <div className={`${PAGE_WIDTH} flex flex-wrap items-center gap-2 pt-3`}>
          <span className="hidden items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-accent-foreground sm:inline-flex">
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.8} /> Student OS
          </span>
          <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={() => setVerifyModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold text-subtle-foreground transition hover:border-primary/40"
            >
              {studentProfile.isVerified ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-verified" strokeWidth={1.8} />
                  <span>Verified<span className="hidden sm:inline"> Student</span></span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.8} />
                  <span>Verify<span className="hidden sm:inline"> Student ID</span></span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setStudentModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep"
            >
              <PlusCircle className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">List Student Item</span>
              <span className="sm:hidden">Sell</span>
            </button>
          </div>
        </div>
        <nav aria-label="Student OS" className={`${PAGE_WIDTH} no-scrollbar flex gap-2 overflow-x-auto py-3`}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={pill(active)}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                <span>{t.label}</span>
              </Link>
            );
          })}
          <Link to={role === "guest" ? "/" : "/buyer"} className={pill(false)}>
            <ShoppingBag className="h-4 w-4" strokeWidth={1.8} />
            <span>Main Mall</span>
          </Link>
        </nav>
      </div>

      <main className={`${PAGE_WIDTH} py-6`}>
        <Outlet />
      </main>

      <CampusSwitchPrompt />
      <ListStudentItemModal />
      <StudentVerificationModal />
    </AppShell>
  );
}
