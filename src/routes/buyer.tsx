import { createFileRoute, redirect } from "@tanstack/react-router";
import { BuyerShell } from "@/components/naflis/BuyerShell";
import { useNaflis } from "@/lib/naflis/store";

export const Route = createFileRoute("/buyer")({
  beforeLoad: () => {
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
