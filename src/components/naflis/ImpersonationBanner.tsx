import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, LogOut } from "lucide-react";
import { ROLE_META } from "@/lib/naflis/roles";
import { useNaflis } from "@/lib/naflis/store";
import { formatCountdown, useNow } from "@/components/naflis/PurchaseOptions";
import { endViewAs } from "@/services/staffService";

/** Persistent floating warning while a Super Admin is viewing as someone else. Mounted at the app root. */
export function ImpersonationBanner() {
  const session = useNaflis((s) => s.impersonation);
  const navigate = useNavigate();
  const now = useNow(1000);
  const remaining = session ? session.expiresAt - now : 0;

  useEffect(() => {
    if (session && remaining <= 0) {
      void endViewAs("expired").then(() => navigate({ to: "/super/view-as" }));
    }
  }, [session, remaining, navigate]);

  if (!session) return null;

  const exit = async () => {
    await endViewAs("exit");
    navigate({ to: "/super/view-as" });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-[100] flex justify-center px-3 md:bottom-5"
    >
      <div className="flex max-w-full items-center gap-3 rounded-full border-2 border-amber-500 bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 shadow-2xl">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Viewing as {ROLE_META[session.role].label} ({session.targetName} · {session.context})
        </span>
        <span className="hidden shrink-0 font-mono text-xs opacity-75 sm:inline">{formatCountdown(remaining)}</span>
        <button
          onClick={exit}
          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-950 px-3 py-1 text-xs font-bold text-amber-50 hover:bg-amber-900"
        >
          <LogOut className="h-3.5 w-3.5" /> Exit View
        </button>
      </div>
    </div>
  );
}
