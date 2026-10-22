import { createFileRoute } from "@tanstack/react-router";
import { StudentOSShell } from "@/components/naflis/StudentOSShell";
import { useNaflis } from "@/lib/naflis/store";
import { sessionReady } from "@/lib/sessionReady";

export const Route = createFileRoute("/student-os")({
  // Open to everyone; accounts holding the student role enter in student context.
  // Still server-rendered (sessionReady resolves at once there); in the browser it
  // waits for the stored session's roles so a reload doesn't miss the student role.
  beforeLoad: async () => {
    await sessionReady();
    useNaflis.getState().enterContext(["student"]);
  },
  component: StudentOSShell,
});
