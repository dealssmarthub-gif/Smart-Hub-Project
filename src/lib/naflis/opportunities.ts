import { dateOnly } from "./timetable";
import type { Opportunity, OpportunityType } from "./studentSeed";

export type DeadlineFilter = "any" | "7" | "30" | "later";

export interface OpportunityFilters {
  type: OpportunityType | "all";
  institution: string;
  programme: string; // "any" or a programme
  level: string; // "any" or a level
  deadline: DeadlineFilter;
  showClosed: boolean;
  savedOnly: boolean;
  saved: string[];
  query: string;
}

export function daysLeft(o: Pick<Opportunity, "deadline">, today: number): number {
  return Math.round((dateOnly(o.deadline) - today) / 86_400_000);
}

/** Filters and sorts by closing date. Empty programme / level lists mean "open to all". */
export function filterOpportunities(list: Opportunity[], f: OpportunityFilters, today: number): Opportunity[] {
  const query = f.query.trim().toLowerCase();
  return list
    .filter((o) => f.type === "all" || o.type === f.type)
    .filter((o) => f.institution === "All Campuses" || o.institution === "All Campuses" || o.institution === f.institution)
    .filter((o) => f.programme === "any" || o.programmes.length === 0 || o.programmes.includes(f.programme))
    .filter((o) => f.level === "any" || o.levels.length === 0 || o.levels.includes(f.level))
    .filter((o) => {
      const d = daysLeft(o, today);
      if (d < 0) return f.showClosed;
      if (f.deadline === "7") return d <= 7;
      if (f.deadline === "30") return d <= 30;
      if (f.deadline === "later") return d > 30;
      return true;
    })
    .filter((o) => !f.savedOnly || f.saved.includes(o.id))
    .filter((o) => !query || `${o.title} ${o.organization} ${o.description}`.toLowerCase().includes(query))
    .sort((a, b) => dateOnly(a.deadline) - dateOnly(b.deadline));
}
