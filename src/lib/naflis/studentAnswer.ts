// "Are you a student?": self-declared, saved as profile fields only
// (profiles.is_student / student_campus). It decides what someone sees, never
// what they can do: sign-up never grants a role.

export interface StudentAnswer {
  /** null until answered. */
  isStudent: boolean | null;
  /** A campus id from public.campuses (e.g. "UG - Legon"), or "". */
  campus: string;
}

/** Is the answer complete enough to save? A student must pick a campus. */
export function studentAnswerError(a: StudentAnswer): string | null {
  if (a.isStudent === null) return "Tell us whether you're a student.";
  if (a.isStudent && !a.campus) return "Choose your institution and campus.";
  return null;
}

/**
 * The sign-up metadata sent to Supabase. Only profile fields: no role, no
 * roles (handle_new_user ignores them anyway and always creates a buyer).
 */
export function signUpMetadata(fullName: string, a: StudentAnswer) {
  const isStudent = a.isStudent === true;
  return {
    full_name: fullName.trim(),
    is_student: isStudent,
    student_campus: isStudent && a.campus ? a.campus : null,
  };
}
