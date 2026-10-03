import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Briefcase, Building2, CalendarClock, GraduationCap, MapPin, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { fmtDate } from "@/lib/naflis/format";
import { LEVELS, type Opportunity, type OpportunityType } from "@/lib/naflis/studentSeed";
import { dateOnly, startOfDay } from "@/lib/naflis/timetable";
import { useOpportunities } from "@/services/studentOs";
import { daysLeft, filterOpportunities } from "@/lib/naflis/opportunities";

export const Route = createFileRoute("/student-os/opportunities")({
  component: OpportunitiesBoard,
});

const TYPES: { id: OpportunityType | "all"; label: string; icon: typeof Briefcase }[] = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "job", label: "Jobs", icon: Briefcase },
  { id: "internship", label: "Internships", icon: Building2 },
  { id: "scholarship", label: "Scholarships", icon: GraduationCap },
];
const DEADLINES = [
  { id: "any", label: "Any deadline" },
  { id: "7", label: "Closing within 7 days" },
  { id: "30", label: "Closing within 30 days" },
  { id: "later", label: "More than 30 days left" },
] as const;
const select = "h-9 rounded-lg border bg-card px-2.5 text-xs font-medium";

function OpportunitiesBoard() {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const profile = useNaflis((s) => s.studentProfile);
  const saved = useNaflis((s) => s.savedOpportunities);
  const toggleSaved = useNaflis((s) => s.toggleSavedOpportunity);
  const { opportunities, live } = useOpportunities();
  const today = startOfDay(Date.now());

  const myProgramme = profile.course?.replace(/^B\w+\.?\s*/i, "");
  const [type, setType] = useState<OpportunityType | "all">("all");
  const [institution, setInstitution] = useState(activeCampus);
  const [programme, setProgramme] = useState("any");
  const [level, setLevel] = useState(profile.isVerified && profile.level ? profile.level : "any");
  const [deadline, setDeadline] = useState<(typeof DEADLINES)[number]["id"]>("any");
  const [showClosed, setShowClosed] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [q, setQ] = useState("");

  const programmes = useMemo(
    () => [...new Set(opportunities.flatMap((o) => o.programmes))].sort(),
    [opportunities],
  );

  const results = useMemo(
    () => filterOpportunities(opportunities, { type, institution, programme, level, deadline, showClosed, savedOnly, saved, query: q }, today),
    [opportunities, type, institution, programme, level, deadline, showClosed, savedOnly, saved, q, today],
  );

  const counts = useMemo(() => {
    const open = opportunities.filter((o) => daysLeft(o, today) >= 0);
    return { all: open.length, job: 0, internship: 0, scholarship: 0, ...Object.fromEntries((["job", "internship", "scholarship"] as const).map((t) => [t, open.filter((o) => o.type === t).length])) };
  }, [opportunities, today]);

  const reset = () => {
    setType("all"); setInstitution(activeCampus); setProgramme("any"); setLevel("any"); setDeadline("any"); setShowClosed(false); setSavedOnly(false); setQ("");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Briefcase className="h-6 w-6 text-sky-500" /> Campus Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Jobs, internships and scholarships for students. Sorted by closing date.
          {!live && <span className="text-xs"> (Sample listings — add rows to <code>opportunities</code> to go live.)</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${type === t.id ? "border-sky-500 bg-sky-500 text-white" : "hover:bg-muted"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              <span className={`rounded-full px-1.5 text-[10px] ${type === t.id ? "bg-white/20" : "bg-muted"}`}>{counts[t.id as keyof typeof counts]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles, companies…" className="h-9 pl-8 text-xs" />
        </div>
        <select aria-label="Institution" className={select} value={institution} onChange={(e) => setInstitution(e.target.value)}>
          {CAMPUSES.map((c) => <option key={c} value={c}>{c === "All Campuses" ? "All institutions" : c}</option>)}
        </select>
        <select aria-label="Programme" className={select} value={programme} onChange={(e) => setProgramme(e.target.value)}>
          <option value="any">Any programme</option>
          {programmes.map((p) => <option key={p} value={p}>{p}{p === myProgramme ? " (yours)" : ""}</option>)}
        </select>
        <select aria-label="Level" className={select} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="any">Any level</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select aria-label="Application deadline" className={select} value={deadline} onChange={(e) => setDeadline(e.target.value as typeof deadline)}>
          {DEADLINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-sky-500" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} /> Saved
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-sky-500" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed
        </label>
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No opportunities match these filters.</p>
          <Button variant="link" size="sm" onClick={reset}>Reset filters</Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {results.map((o) => {
            const d = daysLeft(o, today);
            const isSaved = saved.includes(o.id);
            return (
              <article key={o.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${d < 0 ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant="secondary" className="mb-1 capitalize">{o.type}</Badge>
                    <h3 className="font-bold leading-snug">{o.title}</h3>
                    <p className="text-sm text-muted-foreground">{o.organization}</p>
                  </div>
                  <button
                    onClick={() => { toggleSaved(o.id); toast.success(isSaved ? "Removed from saved" : "Saved"); }}
                    aria-label={isSaved ? "Unsave" : "Save"}
                    className="shrink-0 rounded-md p-1.5 hover:bg-muted"
                  >
                    {isSaved ? <BookmarkCheck className="h-4 w-4 text-sky-500" /> : <Bookmark className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 line-clamp-3 text-sm">{o.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><MapPin className="h-3 w-3" /> {o.location} · {o.mode}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{o.institution === "All Campuses" ? "Open to all institutions" : o.institution}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{o.programmes.length ? o.programmes.join(", ") : "All programmes"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{o.levels.length ? o.levels.join(", ") : "All levels"}</span>
                  {o.value && <span className="rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">{o.value}</span>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className={`flex items-center gap-1 text-xs font-semibold ${d < 0 ? "text-muted-foreground" : d <= 7 ? "text-error" : "text-muted-foreground"}`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {d < 0 ? `Closed ${fmtDate(dateOnly(o.deadline))}` : d === 0 ? "Closes today" : `Closes in ${d} day${d === 1 ? "" : "s"} · ${fmtDate(dateOnly(o.deadline))}`}
                  </span>
                  {o.applyUrl && d >= 0 ? (
                    <Button asChild size="sm"><a href={o.applyUrl} target="_blank" rel="noopener noreferrer">Apply</a></Button>
                  ) : (
                    d >= 0 && <Button size="sm" variant="outline" onClick={() => toast.info(`Apply through ${o.organization}'s careers page.`)}>How to apply</Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
