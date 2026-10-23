import { useFeatureFlag } from "@/lib/featureFlags";
import { useNaflis, useUserRoles } from "@/lib/naflis/store";
import type { Role } from "@/lib/naflis/roles";

// Who sees Student OS in the mall's navigation. NAFLIS Mall is for everyone;
// Student OS is linked only for signed-in accounts that say they are students.
// This is display only: nothing that publishes, scopes staff or checks access
// may use it (the database never does).

/** Is this signed-in account a (self-declared) student? */
export function isStudentAccount(held: Role[]): boolean {
  return held.includes("student");
}

/** The signed-in student's own campus, where the mall's campus filter starts. Null until it's known. */
export function useStudentCampus(): string | null {
  return null;
}

/** Show Student OS links: signed in, a student, and Student OS switched on. */
export function useIsStudent(): boolean {
  const signedIn = useNaflis((s) => Boolean(s.currentUserId));
  const held = useUserRoles();
  const studentOs = useFeatureFlag("student_os");
  return signedIn && studentOs && isStudentAccount(held);
}
