// Live-data mappers and contact helpers: real rows carry only what the database
// holds, and a seller without a phone gets no contact link (no fallback number).
import { describe, expect, it } from "vitest";
import { telHref, whatsappNumber } from "@/lib/naflis/format";
import { mapDbProduct } from "@/lib/naflis/mapProduct";
import { mapDbStudentListing, PHONE_PATTERN } from "@/services/studentListings";
import { mapDbEvent, mapDbResource } from "@/services/campusContent";

describe("seller contact", () => {
  it("turns Ghana local numbers into wa.me digits", () => {
    expect(whatsappNumber("024 123 4567")).toBe("233241234567");
    expect(whatsappNumber("+233 24 123 4567")).toBe("233241234567");
  });

  it("gives no link without a usable number", () => {
    for (const phone of [undefined, null, "", "  ", "12345"]) {
      expect(whatsappNumber(phone)).toBeNull();
      expect(telHref(phone)).toBeNull();
    }
  });

  it("builds tel: links from the seller's own number", () => {
    expect(telHref("+233 24 123 4567")).toBe("tel:+233241234567");
  });

  it("accepts the same phone formats as the database", () => {
    expect(PHONE_PATTERN.test("024 123 4567")).toBe(true);
    expect(PHONE_PATTERN.test("+233 (24) 123-4567")).toBe(true);
    expect(PHONE_PATTERN.test("call me")).toBe(false);
  });
});

describe("student listing rows", () => {
  const row = {
    id: "p1",
    title: "Desk lamp",
    description: "",
    price: "40.00",
    original_price: null,
    category: "Dorm Essentials",
    images: [],
    campus: "UG - Legon",
    item_condition: "Like New",
    meetup_location: null,
    created_at: "2026-10-20T10:00:00Z",
    vendors: { store_name: "Ama", user_id: "u1", contact_phone: null },
  };

  it("invents no old price, phone, photo, location or verification", () => {
    const l = mapDbStudentListing(row);
    expect(l.price).toBe(40);
    expect(l.originalPrice).toBeUndefined();
    expect(l.sellerPhone).toBeUndefined();
    expect(l.image).toBe("");
    expect(l.hostelLocation).toBeUndefined();
    expect(l.isVerifiedStudent).toBe(false);
  });

  it("never carries the vendor's phone (it's fetched on request), keeps a real, higher original price", () => {
    const l = mapDbStudentListing({
      ...row,
      vendor_id: "v-1",
      original_price: "60",
      // Even if a row ever held it, the listing doesn't take it (20261024120000).
      vendors: { ...row.vendors, contact_phone: "024 123 4567" },
    });
    expect(l.sellerPhone).toBeUndefined();
    expect(l.vendorId).toBe("v-1");
    expect(l.originalPrice).toBe(60);
  });
});

describe("mall product rows", () => {
  it("show no discount, demand or flash sale the database doesn't hold", () => {
    const p = mapDbProduct({
      id: "m1",
      title: "Kettle",
      price: 120,
      vendor_id: "v1",
      created_at: "2026-10-20T10:00:00Z",
    });
    expect(p.originalPrice).toBe(p.price);
    expect(p.demand).toBe(0);
    expect(p.flashSale).toBeUndefined();
    expect(p.priceHistory).toEqual([{ date: "2026-10-20", price: 120 }]);
  });
});

describe("campus content rows", () => {
  it("keeps notices as announcements so they stay off the Events page", () => {
    const base = {
      id: "e1",
      title: "Townhall",
      campus: "UG - Legon",
      pinned: true,
      created_at: "2026-10-20T10:00:00Z",
    };
    expect(mapDbEvent({ ...base, kind: "announcement" }).kind).toBe("announcement");
    expect(mapDbEvent({ ...base, kind: "event" }).kind).toBe("event");
  });

  it("invents no venue, banner, file or size", () => {
    const e = mapDbEvent({
      id: "e1",
      title: "T",
      campus: "UG - Legon",
      kind: "event",
      created_at: "2026-10-20T10:00:00Z",
    });
    expect(e.venue).toBe("");
    expect(e.bannerUrl).toBeUndefined();
    const r = mapDbResource({
      id: "r1",
      title: "R",
      resource_type: "Past Questions",
      course_code: "DCIT 101",
      campus: "UG - Legon",
      created_at: "2026-10-20T10:00:00Z",
    });
    expect(r.fileUrl).toBeUndefined();
    expect(r.fileSize).toBeUndefined();
    expect(r.downloads).toBe(0);
  });
});
