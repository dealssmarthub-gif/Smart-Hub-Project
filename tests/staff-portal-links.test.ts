// Stage 2b: no buyer, student or public surface links to the institutional
// portal; it stays reachable by its own URL and its guard is unchanged.
// The database side is supabase/tests/staff_portal_access.test.sql.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { useNaflis } from "@/lib/naflis/store";
import { isInstitutionalRole } from "@/lib/naflis/roles";

async function renderAt(p: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [p] }),
    context: { queryClient: new QueryClient() },
    isServer: true,
  });
  await router.load();
  const html = renderToString(
    React.createElement(RouterProvider, { router } as Parameters<typeof RouterProvider>[0]),
  ).replace(/<!-- -->/g, "");
  return { html, pathname: router.state.location.pathname };
}

/** Client-side router: the server-mode one above doesn't follow redirects. */
async function landAt(p: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [p] }),
    context: { queryClient: new QueryClient() },
    isServer: false,
  });
  await router.load();
  return router.state.location;
}

const st = () => useNaflis.getState();
const PORTAL_TEXT =
  /SRC access|Institutional \/ SRC|SRC & institution access|Open SRC Portal|Executive Sign In|Governance Portal/i;

beforeEach(() => {
  localStorage.clear();
  st().resetDemo();
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("institutional portal links", () => {
  it("only the portal itself, its invite page and the role table name /campus-admin", () => {
    const src = path.resolve(__dirname, "../src");
    const allowed = new Set([
      "lib/naflis/roles.ts",
      "routes/campus-admin.tsx",
      "routes/campus-admin.dashboard.tsx",
      "routes/staff-invite.tsx",
      "routeTree.gen.ts",
    ]);
    const offenders = sourceFiles(src)
      .filter((f) => readFileSync(f, "utf8").includes("/campus-admin"))
      .map((f) => path.relative(src, f).replace(/\\/g, "/"))
      .filter((f) => !allowed.has(f));
    expect(offenders).toEqual([]);
  });

  it("no file, the portal's own page included, has a link or access label for the portal", () => {
    // The portal's heading ("Institutional / SRC Portal") is fine; links to it are not.
    const LINK = /<Link[^>]*to=["{]["`]?\/campus-admin/;
    const LABEL =
      /SRC access|SRC & institution access|Institutional \/ SRC Access|Open SRC Portal|Executive Sign In/i;
    const src = path.resolve(__dirname, "../src");
    const offenders = sourceFiles(src)
      .filter((f) => !f.endsWith("routeTree.gen.ts"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return LINK.test(text) || LABEL.test(text);
      })
      .map((f) => path.relative(src, f).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("SRC and dean workspaces are institutional; others are not", () => {
    expect(isInstitutionalRole("src_head")).toBe(true);
    expect(isInstitutionalRole("dean")).toBe(true);
    for (const r of ["buyer", "student", "admin", "super_admin"] as const)
      expect(isInstitutionalRole(r)).toBe(false);
  });

  const pages = [
    "/",
    "/student-os",
    "/student-os/resources",
    "/student-os/calendar",
    "/me",
    "/buyer",
  ];

  it.each(pages)("%s shows no portal link to a signed-out visitor", async (p) => {
    const { html } = await renderAt(p);
    expect(html).not.toContain('href="/campus-admin');
    expect(html).not.toMatch(PORTAL_TEXT);
  });

  it.each(pages)("%s shows no portal link to an SRC executive", async (p) => {
    st().signIn("u_src1"); // seed: student + src_head at UG
    st().switchRole("student");
    const { html } = await renderAt(p);
    expect(html).not.toContain('href="/campus-admin');
    expect(html).not.toMatch(PORTAL_TEXT);
    expect(html).not.toContain("SRC Executive dashboard");
  });
});

describe("the portal URL still works and is still guarded", () => {
  it("a signed-out visit goes to sign-in and comes back afterwards", async () => {
    const to = await landAt("/campus-admin");
    expect(to.pathname).toBe("/login");
    expect(to.search).toMatchObject({ redirect: "/campus-admin" });
  });

  it("a student without a staff role is turned away", async () => {
    st().signIn("u_buyer1"); // seed: buyer + student
    expect((await landAt("/campus-admin")).pathname).toBe("/login");
  });

  it("an SRC executive gets in by URL, even from the student workspace", async () => {
    st().signIn("u_src1");
    st().switchRole("student");
    expect((await landAt("/campus-admin")).pathname).toBe("/campus-admin");
    expect(st().role).toBe("src_head");
  });

  it("an SRC executive still can't open Super Admin", async () => {
    st().signIn("u_src1");
    expect((await landAt("/super")).pathname).toBe("/login");
  });
});
