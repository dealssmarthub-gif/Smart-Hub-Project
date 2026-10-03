// Fallback academic data, used offline / in demo mode / before migration 06 is seeded.
import type { ExamEntry, TimetableEntry } from "./timetable";

export type OpportunityType = "job" | "internship" | "scholarship";

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  organization: string;
  /** "All Campuses" or a specific institution. */
  institution: string;
  /** Empty = open to every programme. */
  programmes: string[];
  /** Empty = open to every level. */
  levels: string[];
  location: string;
  mode: "on-site" | "remote" | "hybrid";
  /** Pay, stipend or award, free text. */
  value?: string;
  deadline: string; // YYYY-MM-DD
  postedAt: string;
  description: string;
  applyUrl?: string;
}

export const LEVELS = ["Level 100", "Level 200", "Level 300", "Level 400", "Postgraduate"];

/** Lat/lng of each campus, for "use my location". */
export const CAMPUS_COORDS: Record<string, { lat: number; lng: number }> = {
  "UG - Legon": { lat: 5.6508, lng: -0.1869 },
  "KNUST - Kumasi": { lat: 6.6745, lng: -1.5716 },
  "UCC - Cape Coast": { lat: 5.1153, lng: -1.2905 },
  "UPSA - Accra": { lat: 5.6603, lng: -0.1663 },
  "ATU - Accra": { lat: 5.5536, lng: -0.2152 },
  "Ashesi University": { lat: 5.7596, lng: -0.2199 },
  GIMPA: { lat: 5.6403, lng: -0.2087 },
  "UMaT - Tarkwa": { lat: 5.2991, lng: -1.9952 },
  "Ho Technical University": { lat: 6.6012, lng: 0.4703 },
};

const SEM = { startsOn: "2026-08-10", endsOn: "2026-11-27", exceptions: ["2026-09-21", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"] };
// 21 Sep: Founders' Day. 12–16 Oct: mid-semester reading week.

const cls = (e: Omit<TimetableEntry, "startsOn" | "endsOn" | "exceptions" | "recurrence"> & Partial<TimetableEntry>): TimetableEntry => ({
  ...SEM,
  recurrence: "weekly",
  ...e,
});

export const SEED_TIMETABLE: TimetableEntry[] = [
  cls({ id: "tt_dcit201", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 201", courseTitle: "Programming I", kind: "lecture", lecturer: "Dr. Kofi Sarpong", hall: "N Block LT 2", location: "Central Teaching Area, Legon", programme: "Computer Science", level: "Level 200", weekday: 1, startTime: "08:30", endTime: "10:30" }),
  cls({ id: "tt_dcit201_lab", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 201", courseTitle: "Programming I — Lab", kind: "lab", lecturer: "Mr. Isaac Mensah (TA)", hall: "CS Lab 3", location: "Computer Science Dept., Legon", programme: "Computer Science", level: "Level 200", weekday: 3, startTime: "14:00", endTime: "16:00", recurrence: "biweekly" }),
  cls({ id: "tt_dcit203", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 203", courseTitle: "Digital & Logic Systems", kind: "lecture", lecturer: "Prof. Ama Boadu", hall: "JQB 23", location: "Jones Quartey Building, Legon", programme: "Computer Science", level: "Level 200", weekday: 2, startTime: "10:30", endTime: "12:30" }),
  cls({ id: "tt_math223", institution: "UG - Legon", campus: "UG - Legon", courseCode: "MATH 223", courseTitle: "Calculus II", kind: "lecture", lecturer: "Dr. Yaw Ofori", hall: "Great Hall Annex", location: "Great Hall, Legon", programme: "Computer Science", level: "Level 200", weekday: 4, startTime: "08:30", endTime: "10:30" }),
  cls({ id: "tt_math223_tut", institution: "UG - Legon", campus: "UG - Legon", courseCode: "MATH 223", courseTitle: "Calculus II — Tutorial", kind: "tutorial", lecturer: "Ms. Efua Asare (TA)", hall: "Maths Dept. Room 4", location: "Mathematics Dept., Legon", programme: "Computer Science", level: "Level 200", weekday: 5, startTime: "13:00", endTime: "14:00" }),
  cls({ id: "tt_ugrc220", institution: "UG - Legon", campus: "UG - Legon", courseCode: "UGRC 220", courseTitle: "Introduction to African Studies", kind: "seminar", lecturer: "Dr. Nana Akua Owusu", hall: "Institute of African Studies Auditorium", location: "IAS, Legon", programme: "All", level: "Level 200", weekday: 3, startTime: "10:30", endTime: "11:30" }),
  cls({ id: "tt_coe251", institution: "KNUST - Kumasi", campus: "KNUST - Kumasi", courseCode: "COE 251", courseTitle: "Digital Electronics", kind: "lecture", lecturer: "Dr. Emmanuel Darko", hall: "Petroleum Building PB 001", location: "College of Engineering, KNUST", programme: "Computer Engineering", level: "Level 200", weekday: 1, startTime: "07:00", endTime: "09:00" }),
  cls({ id: "tt_coe253", institution: "KNUST - Kumasi", campus: "KNUST - Kumasi", courseCode: "COE 253", courseTitle: "Data Structures", kind: "lecture", lecturer: "Prof. Abena Kyei", hall: "Engineering Auditorium", location: "College of Engineering, KNUST", programme: "Computer Engineering", level: "Level 200", weekday: 2, startTime: "13:00", endTime: "15:00" }),
  cls({ id: "tt_buss204", institution: "UCC - Cape Coast", campus: "UCC - Cape Coast", courseCode: "BUSS 204", courseTitle: "Managerial Accounting", kind: "lecture", lecturer: "Dr. Kwesi Annan", hall: "Large Lecture Theatre", location: "School of Business, UCC", programme: "Business Administration", level: "Level 200", weekday: 4, startTime: "09:30", endTime: "11:30" }),
];

export const SEED_EXAMS: ExamEntry[] = [
  { id: "ex_dcit201_mid", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 201", courseTitle: "Programming I", kind: "midsem", date: "2026-10-19", startTime: "09:00", endTime: "11:00", hall: "Great Hall", location: "Great Hall, Legon", invigilator: "Dr. Kofi Sarpong", notes: "Bring student ID. No phones.", programme: "Computer Science", level: "Level 200" },
  { id: "ex_math223_quiz", institution: "UG - Legon", campus: "UG - Legon", courseCode: "MATH 223", courseTitle: "Calculus II", kind: "quiz", date: "2026-10-08", startTime: "08:30", endTime: "09:15", hall: "Great Hall Annex", location: "Great Hall, Legon", programme: "Computer Science", level: "Level 200" },
  { id: "ex_dcit201_final", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 201", courseTitle: "Programming I", kind: "final", date: "2026-12-07", startTime: "13:00", endTime: "16:00", hall: "UG Main Exam Hall B", location: "Exam Centre, Legon", programme: "Computer Science", level: "Level 200" },
  { id: "ex_dcit203_final", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 203", courseTitle: "Digital & Logic Systems", kind: "final", date: "2026-12-09", startTime: "09:00", endTime: "12:00", hall: "UG Main Exam Hall A", location: "Exam Centre, Legon", programme: "Computer Science", level: "Level 200" },
  { id: "ex_dcit201_prac", institution: "UG - Legon", campus: "UG - Legon", courseCode: "DCIT 201", courseTitle: "Programming I — Practical", kind: "practical", date: "2026-11-25", startTime: "14:00", endTime: "16:00", hall: "CS Lab 3", location: "Computer Science Dept., Legon", programme: "Computer Science", level: "Level 200" },
  { id: "ex_coe251_mid", institution: "KNUST - Kumasi", campus: "KNUST - Kumasi", courseCode: "COE 251", courseTitle: "Digital Electronics", kind: "midsem", date: "2026-10-20", startTime: "07:00", endTime: "09:00", hall: "Engineering Auditorium", location: "College of Engineering, KNUST", programme: "Computer Engineering", level: "Level 200" },
];

export const SEED_OPPORTUNITIES: Opportunity[] = [
  { id: "op_mtn_intern", type: "internship", title: "Software Engineering Intern (Summer 2027)", organization: "MTN Ghana", institution: "All Campuses", programmes: ["Computer Science", "Computer Engineering", "Information Technology"], levels: ["Level 300", "Level 400"], location: "Airport City, Accra", mode: "hybrid", value: "GHS 2,500 / month", deadline: "2026-10-31", postedAt: "2026-09-20", description: "12-week placement on the MoMo platform team. Mentorship, real production work and a return offer for top performers." },
  { id: "op_ecobank_grad", type: "job", title: "Graduate Trainee — Retail Banking", organization: "Ecobank Ghana", institution: "All Campuses", programmes: ["Business Administration", "Economics", "Finance"], levels: ["Level 400", "Postgraduate"], location: "Ridge, Accra", mode: "on-site", value: "Competitive", deadline: "2026-11-15", postedAt: "2026-09-28", description: "18-month rotational programme across branches, credit and digital banking." },
  { id: "op_mastercard", type: "scholarship", title: "Mastercard Foundation Scholars Program", organization: "Mastercard Foundation", institution: "UG - Legon", programmes: [], levels: ["Level 100", "Level 200", "Level 300"], location: "UG - Legon", mode: "on-site", value: "Full tuition + stipend", deadline: "2026-10-12", postedAt: "2026-08-30", description: "Covers tuition, accommodation, books and a monthly stipend for academically talented students with financial need." },
  { id: "op_getfund", type: "scholarship", title: "GETFund Local Scholarship (2026/27)", organization: "Ghana Education Trust Fund", institution: "All Campuses", programmes: [], levels: [], location: "Nationwide", mode: "remote", value: "Up to GHS 6,000", deadline: "2026-10-09", postedAt: "2026-09-01", description: "Needs-based support for continuing undergraduate students in public universities." },
  { id: "op_knust_ta", type: "job", title: "Part-time Lab Assistant", organization: "KNUST Dept. of Computer Engineering", institution: "KNUST - Kumasi", programmes: ["Computer Engineering"], levels: ["Level 300", "Level 400"], location: "College of Engineering, KNUST", mode: "on-site", value: "GHS 900 / month", deadline: "2026-10-22", postedAt: "2026-09-25", description: "Support Level 200 digital electronics labs, 10 hours per week." },
  { id: "op_hubtel", type: "internship", title: "Product Design Intern", organization: "Hubtel", institution: "All Campuses", programmes: ["Computer Science", "Information Technology", "Art & Design"], levels: ["Level 300", "Level 400"], location: "Remote / Accra", mode: "remote", value: "GHS 1,800 / month", deadline: "2026-11-05", postedAt: "2026-09-30", description: "Design checkout and merchant tools used by thousands of Ghanaian businesses." },
  { id: "op_ucc_research", type: "internship", title: "Research Assistant — Fisheries Economics", organization: "UCC Centre for Coastal Management", institution: "UCC - Cape Coast", programmes: ["Economics", "Fisheries Science"], levels: ["Level 400", "Postgraduate"], location: "UCC - Cape Coast", mode: "on-site", value: "Stipend", deadline: "2026-09-30", postedAt: "2026-09-01", description: "Field data collection and analysis on coastal livelihoods." },
  { id: "op_ashesi_campus", type: "job", title: "Campus Brand Ambassador", organization: "NAFLIS Mall", institution: "All Campuses", programmes: [], levels: [], location: "Your campus", mode: "hybrid", value: "Commission + GHS 400 / month", deadline: "2026-12-15", postedAt: "2026-10-01", description: "Run student deal drops and onboard hostel vendors on your campus." },
];
