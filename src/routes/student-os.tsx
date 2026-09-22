import { createFileRoute } from "@tanstack/react-router";
import { StudentOSShell } from "@/components/naflis/StudentOSShell";

export const Route = createFileRoute("/student-os")({
  component: StudentOSShell,
});
