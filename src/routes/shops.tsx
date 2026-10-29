import { createFileRoute } from "@tanstack/react-router";
import { BuyerShell } from "@/components/naflis/BuyerShell";

// Shops are part of the mall (same shell and tab row) and open to everyone:
// no sign-in gate. Client-rendered like the rest of the mall.
export const Route = createFileRoute("/shops")({
  ssr: false,
  component: BuyerShell,
});
