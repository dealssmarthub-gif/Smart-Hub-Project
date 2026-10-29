import { ArrowUpDown } from "lucide-react";
import { MALL_SORTS, MALL_SORT_LABELS, type MallSort } from "@/lib/naflis/mallOrder";

/** Same pill as the campus filter: "Mixed" (the default shuffle), newest, price. */
export function SortControl({
  value,
  onChange,
}: {
  value: MallSort;
  onChange: (sort: MallSort) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm shadow-soft">
      <ArrowUpDown className="h-4 w-4 shrink-0 text-link" strokeWidth={1.8} aria-hidden />
      <span className="sr-only">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MallSort)}
        className="min-h-11 bg-transparent pr-1 text-sm font-semibold outline-none"
      >
        {MALL_SORTS.map((s) => (
          <option key={s} value={s}>
            {MALL_SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

const moreBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold text-foreground shadow-soft transition hover:bg-accent";

export function ShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" className={moreBtn} onClick={onClick}>
        Show more ({remaining} left)
      </button>
    </div>
  );
}
