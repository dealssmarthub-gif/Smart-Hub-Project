import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, LayoutDashboard, LogOut, PlusCircle, User } from "lucide-react";
import { toast } from "sonner";
import { ROLE_ICONS, useWorkspaces } from "@/components/naflis/ContextSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_META, isInstitutionalRole, roleHome, type Role } from "@/lib/naflis/roles";
import { IS_LIVE, hiddenInLive } from "@/lib/appMode";
import { useNaflis, useUserRoles } from "@/lib/naflis/store";

/** Staff workspaces, each with its own dashboard. */
export const STAFF_ROLES: Role[] = [
  "src_head",
  "dean",
  "delivery",
  "finance",
  "dispute",
  "admin",
  "super_admin",
];

/** Signs out exactly as the old shells did. */
export function useSignOut() {
  const signOut = useNaflis((s) => s.signOut);
  const navigate = useNavigate();
  return () => {
    signOut();
    toast.success("Signed out successfully");
    navigate({ to: "/" });
  };
}

/**
 * Desktop account control. Signed out: "Sign in". Signed in: the account menu
 * with Me, a Dashboard link per staff role held, workspace switching (as the
 * old ContextSwitcher), Join Student OS and Sign out.
 */
export function UserMenu() {
  const user = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const held = useUserRoles();
  const ws = useWorkspaces();
  const navigate = useNavigate();
  const signOut = useSignOut();

  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep"
      >
        Sign in
      </Link>
    );
  }

  // Live: no dashboards that run on in-browser data only (appMode LIVE_HIDDEN_PATHS).
  // Institutional portals are reached by their own URL, never from this menu.
  const staff = held.filter(
    (r) => STAFF_ROLES.includes(r) && !isInstitutionalRole(r) && !hiddenInLive(roleHome(r)),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-11 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3 text-sm font-semibold shadow-soft transition hover:border-primary/40"
        aria-label="Account menu"
      >
        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full bg-muted object-cover" />
        <span className="hidden max-w-[9rem] truncate xl:inline">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl p-2">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-bold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.email} · {ROLE_META[ws.active].label}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 gap-3 rounded-xl"
          onSelect={() => navigate({ to: "/me" })}
        >
          <User className="h-4 w-4 text-link" strokeWidth={1.8} /> {IS_LIVE ? "Me — account & workspaces" : "Me — wallet, orders & more"}
        </DropdownMenuItem>
        {staff.map((r) => (
          <DropdownMenuItem
            key={`dash-${r}`}
            className="min-h-11 gap-3 rounded-xl"
            onSelect={() => ws.switchTo(r)}
          >
            <LayoutDashboard className="h-4 w-4 text-link" strokeWidth={1.8} /> {ROLE_META[r].label}{" "}
            dashboard
          </DropdownMenuItem>
        ))}
        {ws.roles.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch workspace
            </DropdownMenuLabel>
            {ws.roles.map((r) => {
              const Icon = ROLE_ICONS[r];
              return (
                <DropdownMenuItem
                  key={r}
                  className="min-h-11 gap-3 rounded-xl"
                  onSelect={() => ws.switchTo(r)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-link" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{ROLE_META[r].label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ROLE_META[r].description}
                    </span>
                  </span>
                  {r === ws.active && <Check className="h-4 w-4 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        {ws.canJoinStudentOs && (
          <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={ws.joinStudentOs}>
            <PlusCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} /> Join Student
            OS
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onSelect={signOut}>
          <LogOut className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { roleHome };
