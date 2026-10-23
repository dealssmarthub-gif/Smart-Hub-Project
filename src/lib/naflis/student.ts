import { IS_LIVE } from "@/lib/appMode";
import { useFeatureFlag } from "@/lib/featureFlags";
import { resolveRoles } from "@/lib/naflis/roles";
import { useNaflis, type User } from "@/lib/naflis/store";

// Who sees Student OS in the mall's navigation. NAFLIS Mall is for everyone;
// Student OS is linked only for signed-in accounts that say they are students.
// Live: the self-declared profile field (profiles.is_student). Demo personas
// keep the student role. Display only: nothing that publishes, scopes staff
// or checks access may use it (the database never does).

/** Is this signed-in account a (self-declared) student? */
export function isStudentAccount(user: User | undefined): boolean {
  if (!user) return false;
  return IS_LIVE ? Boolean(user.isStudent) : resolveRoles(user).includes("student");
}

const useCurrentUser = () => useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));

/** Show Student OS links: signed in, a student, and Student OS switched on. */
export function useIsStudent(): boolean {
  const user = useCurrentUser();
  const studentOs = useFeatureFlag("student_os");
  return studentOs && isStudentAccount(user);
}

/** The signed-in student's own campus, where the mall's campus filter starts. Null until it's known. */
export function useStudentCampus(): string | null {
  const user = useCurrentUser();
  return isStudentAccount(user) ? (user?.studentCampus ?? null) : null;
}
