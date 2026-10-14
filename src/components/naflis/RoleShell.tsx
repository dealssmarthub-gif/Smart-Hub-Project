import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { ContextSwitcher } from "@/components/naflis/ContextSwitcher";
import { Button } from "@/components/ui/button";
import { useNaflis } from "@/lib/naflis/store";
import { toast } from "sonner";

/**
 * Shell for staff workspaces (admin, finance, dispute, delivery, super admin).
 * Same controls as before — Landing, theme, workspace switcher, Sign Out — in
 * the new visual style. Staff pages keep a wider canvas for their tables.
 */
export function RoleShell({
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  badge?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const signOut = useNaflis((s) => s.signOut);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border-soft bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 md:h-[72px]">
          <Logo compact />
          <div className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/"><ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> <span className="hidden sm:inline">Landing</span></Link>
            </Button>
            <ThemeToggle />
            <ContextSwitcher />
            <Button
              variant="outline"
              size="sm"
              aria-label="Sign out"
              onClick={() => {
                signOut();
                toast.success("Signed out successfully");
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4 sm:hidden" strokeWidth={1.8} />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <Icon className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {badge && (
            <span className="inline-flex items-center rounded-full bg-tile-butter px-3 py-1 text-xs font-bold text-[#7a5200] dark:text-[#f5d27a]">{badge}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-border-soft bg-card p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
