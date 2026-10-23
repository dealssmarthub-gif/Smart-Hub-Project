import { MapPin } from "lucide-react";

/** The mall's campus filter: "All campuses" plus the campuses that have listings. */
export function CampusFilter({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: string[];
  onChange: (campus: string | null) => void;
}) {
  // A chosen campus with no listings yet stays selectable, so the choice is never lost.
  const all = value && !options.includes(value) ? [...options, value] : options;
  return (
    <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm shadow-soft">
      <MapPin className="h-4 w-4 shrink-0 text-link" strokeWidth={1.8} />
      <span className="sr-only">Campus</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-11 bg-transparent pr-1 text-sm font-semibold outline-none"
      >
        <option value="">All campuses</option>
        {all.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
