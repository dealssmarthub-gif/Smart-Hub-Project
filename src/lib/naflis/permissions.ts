// ============================================================================
// INSTITUTIONAL PERMISSIONS — scoped staff grants.
// A grant gives a person specific permissions inside ONE institution, either
// for one campus or every campus of that institution. Nothing carries across
// institutions: an SRC executive at School A can't see or touch School B.
// Mirrors public.staff_grants / naflis_has_permission() in migration 07.
// ============================================================================

export const PERMISSIONS = [
  "student.announcements.create",
  "student.events.create",
  "student.timetable.manage",
  "student.resources.manage",
  "student.tickets.sell",
  "student.tickets.validate",
  "student.lostfound.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<Permission, string> = {
  "student.announcements.create": "Publish announcements",
  "student.events.create": "Create events",
  "student.timetable.manage": "Manage timetables & exams",
  "student.resources.manage": "Upload academic resources",
  "student.tickets.sell": "Sell event tickets",
  "student.tickets.validate": "Scan & validate tickets",
  "student.lostfound.manage": "Run the Lost & Found desk",
};

export interface Institution {
  id: string;
  name: string;
  campuses: string[];
}

/** Campus ids match the app's existing campus names. */
export const INSTITUTIONS: Institution[] = [
  { id: "ug", name: "University of Ghana", campuses: ["UG - Legon"] },
  { id: "knust", name: "Kwame Nkrumah University of Science & Technology", campuses: ["KNUST - Kumasi"] },
  { id: "ucc", name: "University of Cape Coast", campuses: ["UCC - Cape Coast"] },
  { id: "upsa", name: "University of Professional Studies", campuses: ["UPSA - Accra"] },
  { id: "atu", name: "Accra Technical University", campuses: ["ATU - Accra"] },
  { id: "ashesi", name: "Ashesi University", campuses: ["Ashesi University"] },
  { id: "gimpa", name: "GIMPA", campuses: ["GIMPA"] },
  { id: "umat", name: "University of Mines & Technology", campuses: ["UMaT - Tarkwa"] },
  { id: "htu", name: "Ho Technical University", campuses: ["Ho Technical University"] },
];

/** Grants scoped to every campus of the institution use this campus id. */
export const ALL_CAMPUSES = "*";

export function institutionOfCampus(campus: string): Institution | undefined {
  return INSTITUTIONS.find((i) => i.campuses.includes(campus));
}

export interface StaffGrant {
  id: string;
  /** Set once the invite is accepted. */
  userId?: string;
  email: string;
  name: string;
  title: string;
  role: "src_head" | "dean";
  institutionId: string;
  campusId: string; // a campus name, or ALL_CAMPUSES
  permissions: Permission[];
  status: "invited" | "active" | "revoked";
  /** SHA-256 of the invite token; the raw token only ever lives in the invite link. */
  tokenHash?: string;
  expiresAt?: number;
  invitedBy: string;
  createdAt: number;
  acceptedAt?: number;
  revokedAt?: number;
}

export interface StaffTemplate {
  id: string;
  title: string;
  role: StaffGrant["role"];
  permissions: Permission[];
}

export const STAFF_TEMPLATES: StaffTemplate[] = [
  { id: "src_president", title: "SRC President", role: "src_head", permissions: ["student.announcements.create", "student.events.create", "student.resources.manage", "student.tickets.sell", "student.tickets.validate", "student.lostfound.manage"] },
  { id: "src_secretary", title: "SRC General Secretary", role: "src_head", permissions: ["student.announcements.create", "student.events.create"] },
  { id: "src_events", title: "SRC Events Officer", role: "src_head", permissions: ["student.events.create", "student.tickets.sell", "student.tickets.validate"] },
  { id: "gate_steward", title: "Event Gate Steward", role: "src_head", permissions: ["student.tickets.validate"] },
  { id: "dean_students", title: "Dean of Students", role: "dean", permissions: ["student.announcements.create", "student.events.create", "student.timetable.manage", "student.lostfound.manage"] },
  { id: "registrar", title: "Academic Registrar", role: "dean", permissions: ["student.timetable.manage", "student.resources.manage", "student.announcements.create"] },
];

export interface Actor {
  userId: string | null;
  isSuperAdmin: boolean;
}

/** Active grants held by a user. */
export function grantsFor(grants: StaffGrant[], userId: string | null): StaffGrant[] {
  return userId ? grants.filter((g) => g.userId === userId && g.status === "active") : [];
}

/** Does the actor hold `permission` for content on `campus`? */
export function can(actor: Actor, grants: StaffGrant[], permission: Permission, campus: string): boolean {
  if (actor.isSuperAdmin) return true;
  const inst = institutionOfCampus(campus);
  if (!inst) return false; // "All Campuses" and unknown campuses need super admin
  return grantsFor(grants, actor.userId).some(
    (g) => g.institutionId === inst.id && (g.campusId === ALL_CAMPUSES || g.campusId === campus) && g.permissions.includes(permission),
  );
}

/** Campuses where the actor holds any staff permission (all campuses for super admin). */
export function scopedCampuses(actor: Actor, grants: StaffGrant[]): string[] {
  const all = INSTITUTIONS.flatMap((i) => i.campuses);
  if (actor.isSuperAdmin) return all;
  const out = new Set<string>();
  for (const g of grantsFor(grants, actor.userId)) {
    const inst = INSTITUTIONS.find((i) => i.id === g.institutionId);
    for (const c of inst?.campuses ?? []) if (g.campusId === ALL_CAMPUSES || g.campusId === c) out.add(c);
  }
  return all.filter((c) => out.has(c));
}

export function scopeLabel(g: Pick<StaffGrant, "institutionId" | "campusId">): string {
  const inst = INSTITUTIONS.find((i) => i.id === g.institutionId);
  return `${inst?.name ?? g.institutionId} · ${g.campusId === ALL_CAMPUSES ? "all campuses" : g.campusId}`;
}

/** URL-safe random token (256 bits). */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
