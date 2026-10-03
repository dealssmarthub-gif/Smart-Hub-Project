import { createFileRoute } from "@tanstack/react-router";
import { StudentOSShell } from "@/components/naflis/StudentOSShell";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/student-os")({
  // Open to everyone; accounts holding the student role enter in student context.
  beforeLoad: () => {
    useNaflis.getState().enterContext(["student"]);
  },
  component: StudentOSShell,
});
