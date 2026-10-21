// Phase 4: in live mode the unwired pages are hidden and their flags can't be
// switched on; real products carry no invented delivery, warranty or photo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapDbProduct } from "@/lib/naflis/mapProduct";

async function liveModules() {
  vi.stubEnv("VITE_APP_MODE", "live");
  vi.resetModules();
  const appMode = await import("@/lib/appMode");
  const flags = await import("@/lib/featureFlags");
  return { appMode, flags };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("live mode hides unwired pages", () => {
  it("hides Reserve & Pay, installments and both deals pages, and nothing else", async () => {
    const { appMode } = await liveModules();
    for (const p of [
      "/buyer/reserve",
      "/buyer/installments",
      "/buyer/deals",
      "/student-os/deals",
    ]) {
      expect(appMode.hiddenInLive(p)).toBe(true);
    }
    for (const p of [
      "/buyer",
      "/buyer/search",
      "/student-os/marketplace",
      "/student-os/deals-archive",
    ]) {
      expect(appMode.hiddenInLive(p)).toBe(false);
    }
  });

  it("keeps Reserve & Pay and Pay Later off even after a Super Admin switches them on", async () => {
    const { flags } = await liveModules();
    await flags.setFeatureFlag("reserve_and_pay", { enabled: true });
    await flags.setFeatureFlag("take_now_pay_later", { enabled: true });
    expect(flags.isFeatureEnabled("reserve_and_pay")).toBe(false);
    expect(flags.isFeatureEnabled("take_now_pay_later")).toBe(false);
    expect(flags.isFeatureEnabled("student_os")).toBe(true);
  });

  it("hides nothing in demo mode", async () => {
    vi.resetModules();
    const appMode = await import("@/lib/appMode");
    expect(appMode.hiddenInLive("/buyer/deals")).toBe(false);
  });
});

describe("database products", () => {
  it("invent no delivery time, specs, warranty, location or stock photo", () => {
    const p = mapDbProduct({
      id: "m1",
      title: "Kettle",
      price: 180,
      vendor_id: "v1",
      created_at: "2026-10-20T10:00:00Z",
    });
    expect(p.deliveryDays).toBe(0);
    expect(p.specs).toEqual({});
    expect(p.location).toBe("");
    expect(p.image).toBe("");
  });
});
