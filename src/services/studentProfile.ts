import { supabase } from "@/lib/supabase";
import { useNaflis } from "@/lib/naflis/store";

/**
 * Saves the signed-in user's own "Are you a student?" answer and campus
 * (profiles.is_student / student_campus). RLS lets users update only their
 * own profile; the trigger keeps roles out of reach. Display only: it changes
 * what they see, never what they can do.
 */
export async function saveStudentProfile(answer: {
  isStudent: boolean;
  campus: string;
}): Promise<void> {
  if (!supabase) throw new Error("Not connected to the database.");
  const id = useNaflis.getState().currentUserId;
  if (!id) throw new Error("Sign in first.");
  const { data, error } = await supabase
    .from("profiles")
    .update({
      is_student: answer.isStudent,
      student_campus: answer.isStudent ? answer.campus || null : null,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Your profile couldn't be updated.");
  await useNaflis.getState().refreshRoles();
}
