import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  GraduationCap,
  Store,
  BadgePercent,
  BookOpen,
  PlusCircle,
  Building2,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Search,
} from "lucide-react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { ListStudentItemModal } from "@/components/naflis/ListStudentItemModal";
import { StudentVerificationModal } from "@/components/naflis/StudentVerificationModal";

const TABS = [
  { to: "/student-os", label: "Hub Overview", icon: GraduationCap, exact: true },
  { to: "/student-os/marketplace", label: "Campus Marketplace", icon: Store },
  { to: "/student-os/deals", label: "Student Deals", icon: BadgePercent },
  { to: "/student-os/resources", label: "Resource Hub & Notes", icon: BookOpen },
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
    <div className="min-h-screen bg-background text-foreground">
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
            <div className="relative flex items-center">
              <Building2 className="pointer-events-none absolute left-2.5 h-4 w-4 text-sky-500" />
              <select
                aria-label="Campus Selector"
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-sm transition"
              >
                {CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

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

            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to={role === "buyer" ? "/buyer" : "/"}>
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

      {/* Modals */}
      <ListStudentItemModal />
      <StudentVerificationModal />
    </div>
  );
}
