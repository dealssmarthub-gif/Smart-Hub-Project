// /login renders for guests and signed-in users alike, never signs anyone in on
// its own, and offers explicit demo sign-in buttons.
import { beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import ReactCJS from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { useNaflis } from "@/lib/naflis/store";
import { postSignInPath } from "@/lib/naflis/roles";

const origSES = ReactCJS.useSyncExternalStore;
(ReactCJS as any).useSyncExternalStore = (sub: any, get: any) => origSES(sub, get, get);

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
    isServer: true,
  });
  await router.load();
  const html = renderToString(React.createElement(RouterProvider, { router } as any)).replace(/<!-- -->/g, "");
  return { html, pathname: router.state.location.pathname };
}

const st = () => useNaflis.getState();

beforeEach(() => {
  localStorage.clear();
  st().resetDemo();
});

describe("/login", () => {
  it("stays on /login for a guest and doesn't sign anyone in", async () => {
    const { html, pathname } = await renderAt("/login");
    expect(pathname).toBe("/login");
    expect(html).toContain("Sign In");
    expect(html).not.toContain("Signed in as");
    expect(st().currentUserId).toBeNull();
    expect(st().role).toBe("guest");
  });

  it("offers explicit Demo Buyer / Student / Seller buttons", async () => {
    const { html } = await renderAt("/login");
    for (const label of ["Demo Buyer", "Demo Student", "Demo Seller"]) expect(html).toContain(label);
  });

  it("stays on /login when already signed in, showing who and a Continue option", async () => {
    st().setRole("buyer");
    const { html, pathname } = await renderAt("/login");
    expect(pathname).toBe("/login");
    expect(html).toContain("Signed in as Ama Owusu");
    expect(html).toContain("Continue");
  });

  it("demo buttons sign in only when used, each into its own workspace", () => {
    st().setRole("student");
    expect(st().currentUserId).toBe("u_buyer1");
    expect(postSignInPath(st().role)).toBe("/student-os");
    st().setRole("buyer");
    expect(postSignInPath(st().role)).toBe("/buyer");
    st().setRole("seller");
    expect(postSignInPath(st().role)).toBe("/seller");
  });

  it("guests have no stand-in user", () => {
    const s = st();
    expect(s.users.find((u) => u.id === s.currentUserId)).toBeUndefined();
  });
});
