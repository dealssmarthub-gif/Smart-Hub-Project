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
  ArrowLeft,
  Search,
} from "lucide-react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { ContextSwitcher } from "@/components/naflis/ContextSwitcher";
import { MobileBottomNav } from "@/components/naflis/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { ListStudentItemModal } from "@/components/naflis/ListStudentItemModal";
import { StudentVerificationModal } from "@/components/naflis/StudentVerificationModal";
import { CampusContextBar, CampusSwitchPrompt } from "@/components/naflis/CampusContext";

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
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const setStudentModalOpen = useNaflis((s) => s.setStudentModalOpen);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const role = useNaflis((s) => s.role);

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground md:pb-0">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline-block rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-bold text-sky-500 border border-sky-500/20">
              Student OS
            </span>
          </div>

          {/* Campus Selector Dropdown */}
          <div className="flex items-center gap-2">
            <CampusContextBar />

            {/* Student Verification Badge / Trigger */}
            <button
              onClick={() => setVerifyModalOpen(true)}
              className="hidden md:flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-500 hover:bg-sky-500/20 transition"
            >
              {studentProfile.isVerified ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Verified Student</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-sky-500" />
                  <span>Verify Student ID</span>
                </>
              )}
            </button>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setStudentModalOpen(true)}
              className="bg-sky-500 hover:bg-sky-600 text-white font-medium text-xs shadow-sm gap-1.5"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">List Student Item</span>
              <span className="sm:hidden">Sell</span>
            </Button>

            <ThemeToggle />
            <ContextSwitcher />

            <Button asChild variant="ghost" size="sm" className="hidden text-xs md:inline-flex">
              <Link to={role === "guest" ? "/" : "/buyer"}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                <span className="hidden md:inline">Main Mall</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="border-t bg-card/60 backdrop-blur">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5 no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Outlet */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      <MobileBottomNav context="student" />
      <CampusSwitchPrompt />

      {/* Modals */}
      <ListStudentItemModal />
      <StudentVerificationModal />
    </div>
  );
}
