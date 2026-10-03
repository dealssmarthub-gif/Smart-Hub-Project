// ============================================================================
// ACADEMIC CALENDAR ENGINE — structured timetable + exam data, no PDFs.
// Rows mirror Supabase `timetable_entries` / `exam_entries` (migration 06).
// Times are wall-clock at the campus (Ghana is UTC+0, no DST).
// ============================================================================

export type ClassKind = "lecture" | "tutorial" | "lab" | "seminar";
export type ExamKind = "quiz" | "midsem" | "final" | "practical";
export type Recurrence = "weekly" | "biweekly" | "once";

export interface TimetableEntry {
  id: string;
  institution: string;
  campus: string;
  courseCode: string;
  courseTitle: string;
  kind: ClassKind;
  lecturer: string;
  hall: string;
  /** Where on campus, e.g. "Central Teaching Area, Legon". */
  location: string;
  programme: string;
  level: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  startTime: string; // "08:30"
  endTime: string; // "10:30"
  startsOn: string; // "2026-08-10" — first teaching day of the semester
  endsOn: string; // "2026-11-27"
  recurrence: Recurrence;
  /** Dates (YYYY-MM-DD) with no class, e.g. holidays or reading week. */
  exceptions: string[];
}

export interface ExamEntry {
  id: string;
  institution: string;
  campus: string;
  courseCode: string;
  courseTitle: string;
  kind: ExamKind;
  date: string;
  startTime: string;
  endTime: string;
  hall: string;
  location: string;
  invigilator?: string;
  notes?: string;
  programme: string;
  level: string;
}

export type OccurrenceType = "class" | "exam" | "event";

export interface Occurrence {
  id: string;
  sourceId: string;
  type: OccurrenceType;
  start: number;
  end: number;
  courseCode?: string;
  title: string;
  kindLabel: string;
  lecturer?: string;
  hall: string;
  location: string;
  campus: string;
  /** Human recurrence summary, e.g. "Weekly · Mondays". */
  recurrenceLabel: string;
  notes?: string;
}

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const DAY_MS = 86_400_000;

export const CLASS_KIND_LABEL: Record<ClassKind, string> = { lecture: "Lecture", tutorial: "Tutorial", lab: "Lab", seminar: "Seminar" };
export const EXAM_KIND_LABEL: Record<ExamKind, string> = { quiz: "Quiz", midsem: "Mid-semester exam", final: "Final exam", practical: "Practical exam" };

/** Local-midnight timestamp for a YYYY-MM-DD string. */
export function dateOnly(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function toIsoDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Monday-start week. */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()).getTime();
}

function at(dayTs: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dayTs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export function recurrenceLabel(e: Pick<TimetableEntry, "recurrence" | "weekday">): string {
  if (e.recurrence === "once") return "One-off session";
  return `${e.recurrence === "weekly" ? "Weekly" : "Every 2 weeks"} · ${WEEKDAYS[e.weekday]}`;
}

/** Expands recurring classes into concrete sessions within [from, to). */
export function expandTimetable(entries: TimetableEntry[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of entries) {
    const semStart = dateOnly(e.startsOn);
    const semEnd = dateOnly(e.endsOn);
    // First matching weekday on/after the semester start.
    const first = addDays(semStart, (e.weekday - new Date(semStart).getDay() + 7) % 7);
    const step = e.recurrence === "biweekly" ? 14 : 7;
    const skip = new Set(e.exceptions);
    for (let day = first, i = 0; day <= semEnd; day = addDays(first, ++i * step)) {
      if (e.recurrence === "once" && i > 0) break;
      const start = at(day, e.startTime);
      const end = at(day, e.endTime);
      if (end <= from) continue;
      if (start >= to) break;
      if (skip.has(toIsoDate(day))) continue;
      out.push({
        id: `${e.id}@${toIsoDate(day)}`,
        sourceId: e.id,
        type: "class",
        start,
        end,
        courseCode: e.courseCode,
        title: e.courseTitle,
        kindLabel: CLASS_KIND_LABEL[e.kind],
        lecturer: e.lecturer,
        hall: e.hall,
        location: e.location,
        campus: e.campus,
        recurrenceLabel: recurrenceLabel(e),
      });
    }
  }
  return out;
}

export function examOccurrences(exams: ExamEntry[], from: number, to: number): Occurrence[] {
  return exams
    .map((x) => {
      const day = dateOnly(x.date);
      return {
        id: x.id,
        sourceId: x.id,
        type: "exam" as const,
        start: at(day, x.startTime),
        end: at(day, x.endTime),
        courseCode: x.courseCode,
        title: x.courseTitle,
        kindLabel: EXAM_KIND_LABEL[x.kind],
        lecturer: x.invigilator ? `Invigilator: ${x.invigilator}` : undefined,
        hall: x.hall,
        location: x.location,
        campus: x.campus,
        recurrenceLabel: "One-off · exam",
        notes: x.notes,
      };
    })
    .filter((o) => o.end > from && o.start < to);
}

/** Groups occurrences by local date, sorted by start time. */
export function groupByDay(occ: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of [...occ].sort((a, b) => a.start - b.start)) {
    const key = toIsoDate(o.start);
    map.set(key, [...(map.get(key) ?? []), o]);
  }
  return map;
}

/** Sessions that overlap another one on the same day — likely timetable clashes. */
export function findClashes(occ: Occurrence[]): Set<string> {
  const clash = new Set<string>();
  const sorted = [...occ].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
      clash.add(sorted[i].id);
      clash.add(sorted[j].id);
    }
  }
  return clash;
}

export { DAY_MS };
