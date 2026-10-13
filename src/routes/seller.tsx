import { createFileRoute, redirect } from "@tanstack/react-router";

// The seller workspace moved to the external seller platform (see services/sellerApi.ts).
// Old /seller links — bookmarks, notifications — land in the Buyer marketplace.
export const Route = createFileRoute("/seller")({
  beforeLoad: () => {
    throw redirect({ to: "/buyer" });
  },
});
