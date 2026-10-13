// Sign-in lands in Buyer (or Student); there is no seller workspace. ?redirect is honoured only for same-site paths.
import { beforeEach, describe, expect, it } from "vitest";
import { useNaflis } from "@/lib/naflis/store";
import { defaultContext, postSignInPath, resolveRoles } from "@/lib/naflis/roles";

const st = () => useNaflis.getState();
const session = (id: string, email: string, role?: string) => ({ id, email, user_metadata: { role, full_name: "Test User" } });

beforeEach(() => {
  localStorage.clear();
  st().resetDemo();
});

describe("sign-in destination", () => {
  it("an account that registered as a seller starts in the Buyer workspace", async () => {
    const role = await st().completeSignIn(session("11111111-1111-1111-1111-111111111111", "new.seller@test.gh", "seller"));
    expect(role).toBe("buyer");
    expect(postSignInPath(role)).toBe("/buyer");
    // Sellers live on the external platform: the legacy role isn't held or switchable.
    expect(resolveRoles(st().users.find((u) => u.id === st().currentUserId))).toEqual(["buyer"]);
    expect(st().switchRole("seller" as any)).toBe(false);
  });

  it("an account with the student role starts in Student OS", async () => {
    // Ama (seed) holds buyer + student.
    const role = await st().completeSignIn(session("u_buyer1", "ama@demo.gh", "buyer"));
    expect(role).toBe("student");
    expect(postSignInPath(role)).toBe("/student-os");
  });

  it("shop-owning accounts also start in Buyer and hold no seller role", async () => {
    const role = await st().completeSignIn(session("u_seller1", "seller@trendtech.gh", "seller"));
    expect(role).toBe("buyer");
    expect(st().role).toBe("buyer");
    expect(resolveRoles(st().users.find((u) => u.id === "u_seller1"))).toEqual(["buyer"]);
  });

  it("re-syncing the same session (token refresh) keeps the workspace the user chose", async () => {
    await st().completeSignIn(session("u_buyer1", "ama@demo.gh", "buyer"));
    st().switchRole("buyer");
    st().syncUser(session("u_buyer1", "ama@demo.gh", "buyer"));
    await st().completeSignIn(session("u_buyer1", "ama@demo.gh", "buyer"));
    expect(st().role).toBe("buyer");
  });

  it("honours same-site redirects and rejects open redirects", () => {
    expect(postSignInPath("buyer", "/buyer/checkout")).toBe("/buyer/checkout");
    expect(postSignInPath("buyer", "/staff-invite?token=abc")).toBe("/staff-invite?token=abc");
    expect(postSignInPath("buyer", "//evil.example")).toBe("/buyer");
    expect(postSignInPath("buyer", "https://evil.example")).toBe("/buyer");
    expect(postSignInPath("student", undefined)).toBe("/student-os");
  });

  it("defaultContext never picks staff roles", () => {
    expect(defaultContext(["buyer"])).toBe("buyer");
    expect(defaultContext(["buyer", "student", "src_head"])).toBe("student");
    expect(defaultContext(["buyer", "super_admin"])).toBe("buyer");
  });
});
