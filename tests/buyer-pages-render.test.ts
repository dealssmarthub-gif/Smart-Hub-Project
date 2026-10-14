// Regression (known issues #28/#29): the orders list, an order page and Alerts
// render without an unstable store snapshot. React's client check — "the result
// of getSnapshot should be cached" — is reproduced here by reading each snapshot
// twice and requiring the same value; a fresh array per read used to loop forever.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import ReactCJS from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { useNaflis } from "@/lib/naflis/store";
import * as W from "@/services/walletService";

type SES = typeof ReactCJS.useSyncExternalStore;
const react = ReactCJS as unknown as { useSyncExternalStore: SES };
const origSES = react.useSyncExternalStore;
react.useSyncExternalStore = ((sub: Parameters<SES>[0], get: () => unknown) => {
  const first = get();
  if (!Object.is(first, get()))
    throw new Error("Unstable store snapshot: the selector returns a new value on every read");
  return origSES(sub, get, get);
}) as SES;
afterAll(() => {
  react.useSyncExternalStore = origSES;
});

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
    isServer: true,
  });
  await router.load();
  const html = renderToString(
    React.createElement(RouterProvider, { router } as Parameters<typeof RouterProvider>[0]),
  ).replace(/<!-- -->/g, "");
  expect(html).not.toContain("Unstable store snapshot");
  expect(html).not.toContain("server rendering errored");
  return { html, pathname: router.state.location.pathname };
}

const st = () => useNaflis.getState();

beforeEach(() => {
  localStorage.clear();
  st().resetDemo();
});

describe("buyer orders and alerts pages", () => {
  it("render the orders list and the order page, with its delivery confirmation", async () => {
    st().setRole("buyer");
    const cheap = st().products.find((p) => p.price < 300)!;
    const { orderId } = await W.checkout({
      request: {
        deliveryMethod: "standard",
        paymentMethod: "wallet",
        address: "Osu, Accra",
        lines: [{ productId: cheap.id, qty: 1, method: "full" }],
      },
      idempotencyKey: W.newIdempotencyKey(),
    });

    const list = await renderAt("/buyer/orders");
    expect(list.pathname).toBe("/buyer/orders");
    expect(list.html).toContain("My orders");

    for (const to of ["accepted", "processing", "ready", "dispatched", "delivered"] as const) {
      expect(st().advanceOrder(orderId!, to, "test", "admin")).toBe(true);
    }
    const detail = await renderAt(`/buyer/orders/${orderId}`);
    expect(detail.pathname).toBe(`/buyer/orders/${orderId}`);
    expect(detail.html).toContain("Escrow timeline");
    expect(detail.html).toContain("Confirm delivery &amp; release escrow");
    expect(detail.html).not.toContain("My orders");
  });

  it("renders Alerts", async () => {
    st().setRole("buyer");
    const { html, pathname } = await renderAt("/buyer/notifications");
    expect(pathname).toBe("/buyer/notifications");
    expect(html).toContain("Mark all read");
  });
});
