import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, GraduationCap, MapPin, Megaphone, Repeat, Search, User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNaflis } from "@/lib/naflis/store";
import { fmtTime } from "@/lib/naflis/format";
import {
  addDays,
  examOccurrences,
  expandTimetable,
  findClashes,
  groupByDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toIsoDate,
  type Occurrence,
  type OccurrenceType,
} from "@/lib/naflis/timetable";
import { useAcademicCalendar } from "@/services/studentOs";
import { useNow } from "@/components/naflis/PurchaseOptions";

export const Route = createFileRoute("/student-os/calendar")({
  component: AcademicCalendar,
});

type View = "today" | "week" | "month" | "list";
const VIEWS: { id: View; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "list", label: "List" },
];
const TYPE_META: Record<OccurrenceType, { label: string; icon: typeof BookOpen; tone: string }> = {
  class: { label: "Classes", icon: BookOpen, tone: "border-l-sky-500" },
  exam: { label: "Exams", icon: GraduationCap, tone: "border-l-error" },
  event: { label: "Campus events", icon: Megaphone, tone: "border-l-gold" },
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AcademicCalendar() {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const profile = useNaflis((s) => s.studentProfile);
  const campusEvents = useNaflis((s) => s.campusEvents);
  const { timetable, exams, live } = useAcademicCalendar();
  const now = useNow(60_000);

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [types, setTypes] = useState<Record<OccurrenceType, boolean>>({ class: true, exam: true, event: true });
  const [query, setQuery] = useState("");
  const myProgramme = profile.isVerified ? profile.course?.replace(/^B\w+\.?\s*/i, "") : undefined; // "BSc. Computer Science" → "Computer Science"
  const [mineOnly, setMineOnly] = useState(Boolean(myProgramme));

  // Visible window for the current view.
  const [from, to] = useMemo(() => {
    if (view === "today") return [anchor, addDays(anchor, 1)];
    if (view === "week") return [startOfWeek(anchor), addDays(startOfWeek(anchor), 7)];
    if (view === "month") {
      const gridStart = startOfWeek(startOfMonth(anchor));
      return [gridStart, addDays(gridStart, 42)];
    }
    return [anchor, addDays(anchor, 90)];
  }, [view, anchor]);

  const occurrences = useMemo(() => {
    const onCampus = <T extends { campus: string }>(x: T) => activeCampus === "All Campuses" || x.campus === activeCampus;
    const forMe = <T extends { programme: string }>(x: T) =>
      !mineOnly || !myProgramme || x.programme === "All" || x.programme.toLowerCase() === myProgramme.toLowerCase();
    const q = query.trim().toLowerCase();
    const events: Occurrence[] = campusEvents
      .filter((e) => activeCampus === "All Campuses" || e.campus === "All Campuses" || e.campus === activeCampus)
      .map((e) => {
        const start = new Date(e.eventDate).getTime();
        return {
          id: e.id, sourceId: e.id, type: "event" as const, start, end: start + 2 * 3_600_000, title: e.title, kindLabel: e.organizer,
          hall: e.venue, location: e.venue, campus: e.campus, recurrenceLabel: e.pinned ? "Pinned notice" : "One-off event", notes: e.description,
        };
      })
      .filter((o) => o.end > from && o.start < to);

    return [
      ...(types.class ? expandTimetable(timetable.filter(onCampus).filter(forMe), from, to) : []),
      ...(types.exam ? examOccurrences(exams.filter(onCampus).filter(forMe), from, to) : []),
      ...(types.event ? events : []),
    ].filter((o) => !q || `${o.courseCode ?? ""} ${o.title} ${o.lecturer ?? ""} ${o.hall}`.toLowerCase().includes(q));
  }, [timetable, exams, campusEvents, activeCampus, types, query, mineOnly, myProgramme, from, to]);

  const byDay = useMemo(() => groupByDay(occurrences), [occurrences]);
  const clashes = useMemo(() => findClashes(occurrences.filter((o) => o.type !== "event")), [occurrences]);
  const nextExam = useMemo(
    () =>
      examOccurrences(exams.filter((x) => activeCampus === "All Campuses" || x.campus === activeCampus), now, addDays(now, 120))
        .sort((a, b) => a.start - b.start)[0],
    [exams, activeCampus, now],
  );

  const step = (dir: 1 | -1) => {
    if (view === "today") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, 7 * dir));
    else if (view === "month") {
      const d = new Date(anchor);
      setAnchor(new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime());
    } else setAnchor(addDays(anchor, 30 * dir));
  };
  const rangeLabel =
    view === "today"
      ? new Date(anchor).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? `${new Date(from).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} – ${new Date(addDays(to, -1)).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}`
        : view === "month"
          ? new Date(anchor).toLocaleDateString("en-GH", { month: "long", year: "numeric" })
          : `Next 90 days from ${new Date(anchor).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <CalendarDays className="h-6 w-6 text-sky-500" /> Academic Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Lectures, labs, exams and SRC events for {activeCampus}.{" "}
            {!live && <span className="text-xs">(Showing sample timetable — publish rows to <code>timetable_entries</code> to go live.)</span>}
          </p>
        </div>
        {nextExam && (
          <div className="rounded-xl border border-error/30 bg-error/5 px-3 py-2 text-xs">
            <p className="font-semibold text-error">Next exam · {Math.ceil((nextExam.start - now) / 86_400_000)} days</p>
            <p>{nextExam.courseCode} {nextExam.kindLabel} · {new Date(nextExam.start).toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" })}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <div className="flex rounded-lg bg-muted p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${view === v.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(startOfDay(Date.now()))}>Today</Button>
          <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-1 text-sm font-semibold">{rangeLabel}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(Object.keys(TYPE_META) as OccurrenceType[]).map((t) => {
            const Icon = TYPE_META[t].icon;
            return (
              <button
                key={t}
                onClick={() => setTypes((x) => ({ ...x, [t]: !x[t] }))}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${types[t] ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {TYPE_META[t].label}
              </button>
            );
          })}
          {myProgramme && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="accent-sky-500" />
              My programme only
            </label>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Course code, lecturer…" className="h-8 w-48 pl-8 text-xs" />
          </div>
        </div>
      </div>

      {view === "today" && <DayAgenda day={anchor} items={byDay.get(toIsoDate(anchor)) ?? []} clashes={clashes} now={now} />}

      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((day, i) => {
            const items = byDay.get(toIsoDate(day)) ?? [];
            const isToday = toIsoDate(day) === toIsoDate(now);
            return (
              <div key={day} className={`min-w-0 rounded-xl border bg-card p-2 ${isToday ? "border-sky-500" : ""}`}>
                <p className={`mb-2 text-xs font-semibold ${isToday ? "text-sky-500" : "text-muted-foreground"}`}>
                  {DOW[i]} {new Date(day).getDate()}
                </p>
                <div className="space-y-2">
                  {items.length === 0 ? <p className="text-[11px] text-muted-foreground">Free</p> : items.map((o) => <OccurrenceCard key={o.id} o={o} clash={clashes.has(o.id)} compact />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && <MonthGrid anchor={anchor} gridStart={from} byDay={byDay} now={now} onPick={(d) => { setAnchor(d); setView("today"); }} />}

      {view === "list" && (
        <div className="space-y-4">
          {byDay.size === 0 && <Empty />}
          {[...byDay].map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {new Date(items[0].start).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <div className="space-y-2">{items.map((o) => <OccurrenceCard key={o.id} o={o} clash={clashes.has(o.id)} />)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function DayAgenda({ day, items, clashes, now }: { day: number; items: Occurrence[]; clashes: Set<string>; now: number }) {
  if (items.length === 0) return <Empty label={`Nothing scheduled on ${new Date(day).toLocaleDateString("en-GH", { weekday: "long" })}.`} />;
  const next = items.find((o) => o.start > now);
  return (
    <div className="space-y-2">
      {items.map((o) => (
        <div key={o.id} className="relative">
          {o.start <= now && o.end > now && <Badge className="absolute -top-2 right-3 z-10 bg-success text-success-foreground">Now</Badge>}
          {next?.id === o.id && <Badge className="absolute -top-2 right-3 z-10">Up next</Badge>}
          <OccurrenceCard o={o} clash={clashes.has(o.id)} />
        </div>
      ))}
    </div>
  );
}

function OccurrenceCard({ o, clash, compact }: { o: Occurrence; clash?: boolean; compact?: boolean }) {
  const meta = TYPE_META[o.type];
  return (
    <article className={`rounded-lg border border-l-4 bg-background p-2.5 ${meta.tone}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {o.courseCode && <Badge variant="outline" className="font-mono text-[10px]">{o.courseCode}</Badge>}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{o.kindLabel}</span>
        {clash && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-warning" title="Overlaps another session">
            <AlertTriangle className="h-3 w-3" /> Clash
          </span>
        )}
      </div>
      <p className={`mt-1 font-semibold leading-snug ${compact ? "text-xs" : "text-sm"}`}>{o.title}</p>
      <div className={`mt-1 space-y-0.5 text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
        <p className="flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" /> {fmtTime(o.start)} – {fmtTime(o.end)}</p>
        {o.lecturer && <p className="flex items-center gap-1"><User className="h-3 w-3 shrink-0" /> <span className="truncate">{o.lecturer}</span></p>}
        <p className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{o.hall}{!compact && o.location !== o.hall ? ` · ${o.location}` : ""}</span></p>
        {!compact && <p className="flex items-center gap-1"><Repeat className="h-3 w-3 shrink-0" /> {o.recurrenceLabel}</p>}
        {!compact && o.notes && <p className="pt-0.5 italic">{o.notes}</p>}
      </div>
    </article>
  );
}

function MonthGrid({ anchor, gridStart, byDay, now, onPick }: {
  anchor: number; gridStart: number; byDay: Map<string, Occurrence[]>; now: number; onPick: (day: number) => void;
}) {
  const month = new Date(anchor).getMonth();
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted text-center text-[11px] font-semibold text-muted-foreground">
        {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((day) => {
          const items = byDay.get(toIsoDate(day)) ?? [];
          const inMonth = new Date(day).getMonth() === month;
          const count = (t: OccurrenceType) => items.filter((o) => o.type === t).length;
          return (
            <button
              key={day}
              onClick={() => onPick(day)}
              className={`min-h-20 border-b border-r p-1.5 text-left transition hover:bg-muted ${inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}
            >
              <span className={`text-xs font-semibold ${toIsoDate(day) === toIsoDate(now) ? "grid h-5 w-5 place-items-center rounded-full bg-sky-500 text-white" : ""}`}>
                {new Date(day).getDate()}
              </span>
              <div className="mt-1 space-y-0.5 text-[10px]">
                {count("exam") > 0 && <p className="truncate rounded bg-error/15 px-1 font-semibold text-error">{items.filter((o) => o.type === "exam").map((o) => o.courseCode).join(", ")}</p>}
                {count("class") > 0 && <p className="truncate rounded bg-sky-500/10 px-1 text-sky-600 dark:text-sky-400">{count("class")} class{count("class") > 1 ? "es" : ""}</p>}
                {count("event") > 0 && <p className="truncate rounded bg-gold/15 px-1">{count("event")} event</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ label = "Nothing scheduled in this range." }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-50" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
