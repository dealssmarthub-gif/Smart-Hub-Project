import { ChevronDown, GraduationCap, Loader2, LocateFixed, MapPin } from "lucide-react";
import { useLocateCampus } from "@/components/naflis/CampusContext";
import { CAMPUSES, useNaflis } from "@/lib/naflis/store";

/**
 * The campus pill: the active campus, a dropdown to change it, and "use my
 * location". Changing campus goes through the store's switch prompt exactly as
 * the original header control did.
 */
export function CampusPicker({
  tone = "light",
  compact = false,
}: {
  tone?: "light" | "onPrimary";
  compact?: boolean;
}) {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const registered = useNaflis((s) => s.registeredInstitution);
  const verified = useNaflis((s) => s.studentProfile.isVerified);
  const requestCampusSwitch = useNaflis((s) => s.requestCampusSwitch);
  const { locate, locating } = useLocateCampus();
  const onPrimary = tone === "onPrimary";

  return (
    <div className="flex min-w-0 items-center gap-1">
      {verified && registered && (
        <span
          className="hidden items-center gap-1 whitespace-nowrap rounded-full border border-border-soft px-2.5 py-1 text-[11px] font-medium text-muted-foreground 2xl:flex"
          title="Registered institution (set by student verification)"
        >
          <GraduationCap className="h-3.5 w-3.5 text-link" strokeWidth={1.8} /> {registered}
        </span>
      )}
      <label
        className={`relative flex h-11 min-w-0 items-center rounded-full pl-3 pr-8 text-xs font-semibold transition focus-within:ring-2 focus-within:ring-ring ${
          onPrimary
            ? "bg-white/15 text-white hover:bg-white/20"
            : "border border-border bg-card text-foreground shadow-soft hover:border-primary/40"
        }`}
      >
        <MapPin
          className={`mr-1.5 h-4 w-4 shrink-0 ${onPrimary ? "text-white" : "text-link"}`}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="sr-only">Active campus</span>
        <select
          value={activeCampus}
          onChange={(e) => requestCampusSwitch(e.target.value, "manual")}
          title="Active campus"
          className={`absolute inset-0 w-full cursor-pointer appearance-none rounded-full opacity-0`}
        >
          {CAMPUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span
          className={`truncate ${compact ? "max-w-[6.5rem] sm:max-w-[10rem]" : "max-w-[12rem]"}`}
        >
          {activeCampus}
        </span>
        <ChevronDown
          className="pointer-events-none absolute right-3 h-4 w-4 opacity-80"
          strokeWidth={1.8}
          aria-hidden
        />
      </label>
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        aria-label="Use my location to pick a campus"
        title="Use my location"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:opacity-60 ${
          onPrimary
            ? "text-white hover:bg-white/15"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}
