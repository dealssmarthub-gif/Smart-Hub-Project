// Shop slugs are public (/shops/<slug>): made from the name plus a random
// suffix, never from the owner's id. Same shape as naflis_store_slug (20261029120000).
import { describe, expect, it } from "vitest";
import { makeStoreSlug } from "@/lib/naflis/storeSlug";

describe("makeStoreSlug", () => {
  it("kebab-cases the name and adds 6 random characters", () => {
    expect(makeStoreSlug("Ama's Kitchen & Co")).toMatch(/^amas-kitchen-co-[a-z0-9]{6}$/);
  });

  it("falls back to 'shop' for a name with no letters or digits", () => {
    expect(makeStoreSlug("!!!")).toMatch(/^shop-[a-z0-9]{6}$/);
  });

  it("keeps the name part to 40 characters", () => {
    const base = makeStoreSlug("a".repeat(60)).replace(/-[a-z0-9]{6}$/, "");
    expect(base).toHaveLength(40);
  });

  it("differs per call, so two shops with one name don't collide", () => {
    expect(makeStoreSlug("Desk lamps")).not.toBe(makeStoreSlug("Desk lamps"));
  });

  it("is built only from the name it's given", () => {
    const owner = "7a51e000-0000-4000-8000-0000000000a1";
    expect(makeStoreSlug("Kofi's Phones")).not.toContain(owner.slice(0, 8));
  });
});
