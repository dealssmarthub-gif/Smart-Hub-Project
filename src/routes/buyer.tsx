import { createFileRoute, redirect } from "@tanstack/react-router";
import { BuyerShell } from "@/components/naflis/BuyerShell";
import { useNaflis } from "@/lib/naflis/store";
import { sessionReady } from "@/lib/sessionReady";

export const Route = createFileRoute("/buyer")({
  // Signed-in check runs client-side once the stored session and roles are loaded (see sessionReady).
  ssr: false,
  beforeLoad: async () => {
    await sessionReady();
    if (!useNaflis.getState().enterContext(["buyer"])) {
      throw redirect({
        to: "/login",
        search: {
          redirect: "/buyer",
        },
      });
    }
  },
  component: BuyerShell,
});
