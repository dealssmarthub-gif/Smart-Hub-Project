import { createFileRoute } from "@tanstack/react-router";
import { CampusAdminPortal } from "./campus-admin";

export const Route = createFileRoute("/campus-admin/dashboard")({
  component: CampusAdminPortal,
});
