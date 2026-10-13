import { createFileRoute, redirect } from "@tanstack/react-router";

// Deep links into the retired seller workspace (e.g. /seller/intelligence).
export const Route = createFileRoute("/seller/$")({
  beforeLoad: () => {
    throw redirect({ to: "/buyer" });
  },
});
