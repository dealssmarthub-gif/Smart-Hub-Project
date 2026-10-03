import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useNaflis } from "@/lib/naflis/store";

// Seller area. The guard covers the dashboard and Seller Intelligence.
export const Route = createFileRoute("/seller")({
  beforeLoad: ({ location }) => {
    if (!useNaflis.getState().enterContext(["seller"])) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
  },
  component: Outlet,
});
