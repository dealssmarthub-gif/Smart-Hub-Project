import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PlusCircle, Store } from "lucide-react";
import { useMemo } from "react";
import { useNaflis, type Product } from "@/lib/naflis/store";
import { campusOptions, filterByCampus, useMallCampus } from "@/lib/naflis/campusFilter";
import { useStudentCampus } from "@/lib/naflis/student";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-deep";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-accent";

/**
 * The one marketplace: mall products and student listings together, filtered
 * by the mall's campus. Students start at their own campus.
 */
export function useMarketplace(source?: Product[]) {
  const stored = useNaflis((s) => s.products);
  const all = source ?? stored;
  const [campus, setCampus] = useMallCampus(useStudentCampus());
  const items = useMemo(() => filterByCampus(all, campus), [all, campus]);
  const options = useMemo(() => campusOptions(all), [all]);
  return { all, items, campus, setCampus, options };
}

/** "Sell an item": signed in opens the listing form; signed out signs in first, then comes back. */
export function SellButton({ className = primaryBtn }: { className?: string }) {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const openForm = useNaflis((s) => s.setStudentModalOpen);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        signedIn ? openForm(true) : navigate({ to: "/login", search: { redirect: pathname } })
      }
    >
      <PlusCircle className="h-4 w-4" strokeWidth={1.8} /> Sell an item
    </button>
  );
}

/** Never a blank marketplace: say why it's empty and offer "Sell an item". */
export function EmptyMarket({
  campus,
  anyElsewhere,
  onShowAll,
}: {
  campus: string | null;
  /** There are items, just none at this campus. */
  anyElsewhere: boolean;
  onShowAll: () => void;
}) {
  const filtered = Boolean(campus) && anyElsewhere;
  return (
    <div className="rounded-3xl border border-border-soft bg-card p-8 text-center shadow-soft">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-tile-lavender text-tile-lavender-icon">
        <Store className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h3 className="mt-3 text-lg font-extrabold">
        {filtered ? `Nothing at ${campus} yet` : "Nothing for sale yet"}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try all campuses, or be the first to list something here."
          : "Be the first to list something. Items appear here once the seller is approved."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtered && (
          <button type="button" className={secondaryBtn} onClick={onShowAll}>
            Show all campuses
          </button>
        )}
        <SellButton />
      </div>
    </div>
  );
}
