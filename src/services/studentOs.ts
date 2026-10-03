import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ExamEntry, TimetableEntry } from "@/lib/naflis/timetable";
import { SEED_EXAMS, SEED_OPPORTUNITIES, SEED_TIMETABLE, type Opportunity } from "@/lib/naflis/studentSeed";

// Reads Student OS academic data from Supabase (migration 06), falling back to
// the seeded data offline, in demo mode, or while the tables are empty.

async function fetchOr<T>(table: string, map: (row: any) => T, fallback: T[]): Promise<{ rows: T[]; live: boolean }> {
  if (!supabase) return { rows: fallback, live: false };
  try {
    const { data, error } = await supabase.from(table).select("*");
    if (error || !data || data.length === 0) return { rows: fallback, live: false };
    return { rows: data.map(map), live: true };
  } catch {
    return { rows: fallback, live: false };
  }
}

const time = (t: string | null | undefined) => (t ?? "00:00").slice(0, 5);

export const fetchTimetable = () =>
  fetchOr<TimetableEntry>(
    "timetable_entries",
    (r) => ({
      id: String(r.id),
      institution: r.institution,
      campus: r.campus,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      kind: r.kind,
      lecturer: r.lecturer ?? "",
      hall: r.hall ?? "",
      location: r.location ?? "",
      programme: r.programme ?? "All",
      level: r.level ?? "",
      weekday: r.weekday,
      startTime: time(r.start_time),
      endTime: time(r.end_time),
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      recurrence: r.recurrence,
      exceptions: r.exceptions ?? [],
    }),
    SEED_TIMETABLE,
  );

export const fetchExams = () =>
  fetchOr<ExamEntry>(
    "exam_entries",
    (r) => ({
      id: String(r.id),
      institution: r.institution,
      campus: r.campus,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      kind: r.kind,
      date: r.exam_date,
      startTime: time(r.start_time),
      endTime: time(r.end_time),
      hall: r.hall ?? "",
      location: r.location ?? "",
      invigilator: r.invigilator ?? undefined,
      notes: r.notes ?? undefined,
      programme: r.programme ?? "All",
      level: r.level ?? "",
    }),
    SEED_EXAMS,
  );

export const fetchOpportunities = () =>
  fetchOr<Opportunity>(
    "opportunities",
    (r) => ({
      id: String(r.id),
      type: r.type,
      title: r.title,
      organization: r.organization,
      institution: r.institution ?? "All Campuses",
      programmes: r.programmes ?? [],
      levels: r.levels ?? [],
      location: r.location ?? "",
      mode: r.mode ?? "on-site",
      value: r.value ?? undefined,
      deadline: r.deadline,
      postedAt: (r.posted_at ?? r.created_at ?? "").slice(0, 10),
      description: r.description ?? "",
      applyUrl: r.apply_url ?? undefined,
    }),
    SEED_OPPORTUNITIES,
  );

const STALE = 5 * 60_000;

export function useAcademicCalendar() {
  const timetable = useQuery({ queryKey: ["timetable_entries"], queryFn: fetchTimetable, staleTime: STALE, placeholderData: { rows: SEED_TIMETABLE, live: false } });
  const exams = useQuery({ queryKey: ["exam_entries"], queryFn: fetchExams, staleTime: STALE, placeholderData: { rows: SEED_EXAMS, live: false } });
  return {
    timetable: timetable.data?.rows ?? SEED_TIMETABLE,
    exams: exams.data?.rows ?? SEED_EXAMS,
    live: Boolean(timetable.data?.live || exams.data?.live),
    loading: timetable.isFetching || exams.isFetching,
  };
}

export function useOpportunities() {
  const q = useQuery({ queryKey: ["opportunities"], queryFn: fetchOpportunities, staleTime: STALE, placeholderData: { rows: SEED_OPPORTUNITIES, live: false } });
  return { opportunities: q.data?.rows ?? SEED_OPPORTUNITIES, live: Boolean(q.data?.live) };
}

/** Persists the student's active campus (registered institution is set by verification only). */
export async function saveActiveCampus(userId: string | null, campus: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from("profiles").update({ active_campus: campus }).eq("id", userId);
  } catch {
    // best-effort; the local choice still applies
  }
}
