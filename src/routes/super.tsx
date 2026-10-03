import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useNaflis } from "@/lib/naflis/store";

// Super Admin area. The guard covers every child route (dashboard, staff, view-as).
export const Route = createFileRoute("/super")({
  beforeLoad: ({ location }) => {
    // While viewing as someone, the real admin is not "present" — bounce to the banner's Exit.
    if (useNaflis.getState().impersonation || !useNaflis.getState().enterContext(["super_admin"])) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
  },
  component: Outlet,
});
