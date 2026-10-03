// Server-renders the Seller Intelligence page in each state it can be in
// before any network call: gated, no shop, loading, empty, and success
// (restored from the cached last-good data — what a browser refresh shows first).
import { beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import ReactCJS from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useNaflis } from "@/lib/naflis/store";
import { demoDemandLogs } from "@/lib/naflis/intelligence";
import { Route as IntelligenceRoute } from "@/routes/seller.intelligence";

// SSR normally renders the store's *initial* state; render the live (seeded) state instead.
const origSES = ReactCJS.useSyncExternalStore;
(ReactCJS as any).useSyncExternalStore = (sub: any, get: any) => origSES(sub, get, get);

const Page = IntelligenceRoute.options.component as React.ComponentType;

async function render(): Promise<string> {
  const root = createRootRoute({ component: () => React.createElement(Page) });
  const any = createRoute({ getParentRoute: () => root, path: "$", component: () => React.createElement(Page) });
  const router = createRouter({ routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  await router.load();
  const html = renderToString(React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(RouterProvider, { router } as any)));
  // React separates adjacent text nodes with <!-- --> in SSR output.
  return html.replace(/<!-- -->/g, "");
}

const setTier = (tier: "starter" | "growth" | "professional") =>
  useNaflis.setState((s) => ({ stores: s.stores.map((x) => (x.ownerId === "u_seller1" ? { ...x, subscription: tier } : x)) }));
const cache = (logs: unknown[]) =>
  localStorage.setItem("naflis-intel-cache-v1:UG - Legon", JSON.stringify({ logs, source: "demo", fetchedAt: Date.now() }));

beforeEach(() => {
  localStorage.clear();
  useNaflis.getState().resetDemo();
  useNaflis.setState({ currentUserId: "u_seller1", role: "seller" });
});

describe("Seller Intelligence page states", () => {
  it("Starter: shows the plan gate with upgrade options", async () => {
    setTier("starter");
    const html = await render();
    expect(html).toContain("Seller Intelligence is part of the Growth plan");
    expect(html).toContain("Upgrade to Growth");
  });

  it("no shop: asks the user to finish onboarding", async () => {
    useNaflis.setState({ currentUserId: "u_buyer1", role: "buyer" });
    expect(await render()).toContain("Set up your shop first");
  });

  it("loading: skeletons while the first fetch is pending", async () => {
    setTier("growth");
    expect(await render()).toContain('aria-label="Loading intelligence"');
  });

  it("empty: no searches for the campus", async () => {
    setTier("growth");
    cache([]);
    expect(await render()).toContain("No searches on UG - Legon in the last 28 days");
  });

  it("success after refresh: cached data renders immediately; Growth sees pricing locked", async () => {
    setTier("growth");
    cache(demoDemandLogs("UG - Legon", Date.now()));
    const html = await render();
    expect(html).toContain("Searches · 7 days");
    expect(html).toContain("Restock alerts");
    expect(html).toContain("Unmet demand");
    expect(html).not.toContain("Couldn&#x27;t load");
  });

  it("success on Professional: pricing and bundles unlocked; dismissed items stay hidden", async () => {
    setTier("professional");
    cache(demoDemandLogs("UG - Legon", Date.now()));
    useNaflis.getState().setIntelligencePref({ tab: "pricing" });
    const html = await render();
    expect(html).toContain("Market median");
    expect(html).toMatch(/Lower to GH/);
    // Dismissing a recommendation hides it on the next render (persisted state).
    const first = useNaflis.getState().products.find((x) => x.name.startsWith("Sony Noise-Cancelling"))!;
    expect(html).toContain(`${first.name}: `);
    useNaflis.getState().dismissInsight(`price:${first.id}`);
    expect(await render()).not.toContain(`${first.name}: `);
  });
});
