// Stage 2a: the site description and social previews describe only what the
// live site offers.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { siteMeta, SOCIAL_IMAGE } from "@/lib/siteMeta";

const text = siteMeta()
  .map((m) => ("title" in m ? m.title : m.content))
  .join(" ");

describe("site meta", () => {
  it("names the features that exist", () => {
    for (const word of ["notices", "events", "lecture notes", "past questions", "students"]) {
      expect(text.toLowerCase()).toContain(word);
    }
  });

  it("does not advertise unwired features or AI", () => {
    expect(text).not.toMatch(
      /escrow|wallet|reserve|pay later|installment|intelligen|discount|\bAI\b/i,
    );
  });

  it("uses the bundled social image, not a preview screenshot", () => {
    for (const m of siteMeta()) {
      if ("content" in m && /image$/.test(("property" in m ? m.property : m.name) ?? "")) {
        expect(m.content).toBe(SOCIAL_IMAGE);
      }
    }
    expect(existsSync(path.resolve(__dirname, "../../public", SOCIAL_IMAGE.slice(1)))).toBe(true);
  });
});
