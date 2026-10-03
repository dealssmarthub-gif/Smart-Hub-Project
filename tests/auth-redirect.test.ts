// Sign-in lands in Buyer (or Student), never Seller by default; ?redirect is honoured only for same-site paths.
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
    // Seller is still available — one switch away, not forced.
    expect(resolveRoles(st().users.find((u) => u.id === st().currentUserId), st().stores)).toContain("seller");
    expect(st().switchRole("seller")).toBe(true);
  });

  it("an account with the student role starts in Student OS", async () => {
    // Ama (seed) holds buyer + student.
    const role = await st().completeSignIn(session("u_buyer1", "ama@demo.gh", "buyer"));
    expect(role).toBe("student");
    expect(postSignInPath(role)).toBe("/student-os");
  });

  it("existing seller accounts also start in Buyer, and the switcher shows Buyer as active", async () => {
    const role = await st().completeSignIn(session("u_seller1", "seller@trendtech.gh", "seller"));
    expect(role).toBe("buyer");
    expect(st().role).toBe("buyer");
  });

  it("re-syncing the same session (token refresh) keeps the workspace the user chose", async () => {
    await st().completeSignIn(session("u_seller1", "seller@trendtech.gh", "seller"));
    st().switchRole("seller");
    st().syncUser(session("u_seller1", "seller@trendtech.gh", "seller"));
    await st().completeSignIn(session("u_seller1", "seller@trendtech.gh", "seller"));
    expect(st().role).toBe("seller");
  });

  it("honours same-site redirects and rejects open redirects", () => {
    expect(postSignInPath("buyer", "/buyer/checkout")).toBe("/buyer/checkout");
    expect(postSignInPath("buyer", "/staff-invite?token=abc")).toBe("/staff-invite?token=abc");
    expect(postSignInPath("buyer", "//evil.example")).toBe("/buyer");
    expect(postSignInPath("buyer", "https://evil.example")).toBe("/buyer");
    expect(postSignInPath("student", undefined)).toBe("/student-os");
  });

  it("defaultContext never picks seller or staff roles", () => {
    expect(defaultContext(["buyer", "seller"])).toBe("buyer");
    expect(defaultContext(["buyer", "student", "seller", "src_head"])).toBe("student");
    expect(defaultContext(["buyer", "super_admin"])).toBe("buyer");
  });
});
