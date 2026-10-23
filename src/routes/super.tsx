import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useNaflis } from "@/lib/naflis/store";
import { sessionReady } from "@/lib/sessionReady";

// Super Admin area. The guard covers every child route (dashboard, staff, view-as).
export const Route = createFileRoute("/super")({
  // The session lives in the browser, so the server can't decide; the guard runs client-side
  // once the stored session and its roles are loaded (a bookmark lands here, not on /login).
  ssr: false,
  beforeLoad: async ({ location }) => {
    await sessionReady();
    // While viewing as someone, the real admin is not "present" — bounce to the banner's Exit.
    if (useNaflis.getState().impersonation) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
    // Signed out, or not a super admin: the staff sign-in page (never the mall login).
    if (!useNaflis.getState().enterContext(["super_admin"])) {
      throw redirect({ to: "/staff", search: { redirect: location.pathname } });
    }
  },
  component: Outlet,
});
