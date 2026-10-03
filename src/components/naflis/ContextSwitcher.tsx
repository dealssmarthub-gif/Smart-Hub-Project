import { useNavigate } from "@tanstack/react-router";
import {
  Building2, Check, ChevronsUpDown, Crown, GraduationCap, Landmark, PlusCircle, Scale, Shield,
  ShoppingBag, Store, Truck, User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureFlag } from "@/lib/featureFlags";
import { ROLE_META, roleHome, type Role } from "@/lib/naflis/roles";
import { useNaflis, useUserRoles } from "@/lib/naflis/store";

export const ROLE_ICONS: Record<Role, LucideIcon> = {
  guest: User,
  buyer: ShoppingBag,
  seller: Store,
  student: GraduationCap,
  src_head: Building2,
  dean: GraduationCap,
  delivery: Truck,
  finance: Landmark,
  dispute: Scale,
  admin: Shield,
  super_admin: Crown,
};

/** Roles the signed-in user can switch to, plus the actions to move between them. */
export function useWorkspaces() {
  const navigate = useNavigate();
  const active = useNaflis((s) => s.role);
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const switchRole = useNaflis((s) => s.switchRole);
  const openShop = useNaflis((s) => s.openShop);
  const setVerifyModalOpen = useNaflis((s) => s.setVerifyModalOpen);
  const held = useUserRoles();
  const studentOs = useFeatureFlag("student_os");
  const srcPortal = useFeatureFlag("src_portal");

  const roles = held.filter((r) => (r !== "student" || studentOs) && ((r !== "src_head" && r !== "dean") || srcPortal));

  return {
    active,
    signedIn,
    roles,
    canOpenShop: signedIn && !held.includes("seller"),
    canJoinStudentOs: signedIn && studentOs && !held.includes("student"),
    switchTo: (r: Role) => {
      if (!switchRole(r)) return;
      if (r !== active) toast.success(`Switched to ${ROLE_META[r].label} workspace`);
      navigate({ to: roleHome(r) });
    },
    openShop: () => {
      openShop();
      toast.success("Seller workspace unlocked");
      navigate({ to: "/seller" });
    },
    joinStudentOs: () => {
      setVerifyModalOpen(true);
      navigate({ to: "/student-os" });
    },
  };
}

export function ContextSwitcher() {
  const enabled = useFeatureFlag("role_switcher");
  const ws = useWorkspaces();

  if (!enabled || !ws.signedIn) return null;

  const ActiveIcon = ROLE_ICONS[ws.active];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" aria-label="Switch workspace">
          <ActiveIcon className="h-4 w-4 text-sky-500" />
          <span className="hidden text-xs font-semibold sm:inline">{ROLE_META[ws.active].label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch workspace</DropdownMenuLabel>
        {ws.roles.map((r) => {
          const Icon = ROLE_ICONS[r];
          return (
            <DropdownMenuItem key={r} onSelect={() => ws.switchTo(r)} className="gap-3">
              <Icon className="h-4 w-4 shrink-0 text-sky-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{ROLE_META[r].label}</p>
                <p className="truncate text-xs text-muted-foreground">{ROLE_META[r].description}</p>
              </div>
              {r === ws.active && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        {(ws.canOpenShop || ws.canJoinStudentOs) && <DropdownMenuSeparator />}
        {ws.canOpenShop && (
          <DropdownMenuItem onSelect={ws.openShop} className="gap-3">
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Open a shop</span>
          </DropdownMenuItem>
        )}
        {ws.canJoinStudentOs && (
          <DropdownMenuItem onSelect={ws.joinStudentOs} className="gap-3">
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Join Student OS</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
