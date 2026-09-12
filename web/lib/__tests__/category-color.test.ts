import { describe, expect, it } from "vitest";
import { CATEGORY_PALETTE, TRANSFERS_COLOR, UNCATEGORIZED_COLOR, colorFor } from "@/lib/category-color";

const cats = [
  { name: "Coffee", color_index: 3 },
  { name: "Groceries", color_index: 11 },
];

describe("colorFor", () => {
  it("has 12 palette entries", () => expect(CATEGORY_PALETTE).toHaveLength(12));
  it("uses the category's color_index", () => expect(colorFor("Coffee", cats)).toBe(CATEGORY_PALETTE[3]));
  it("special-cases Transfers and null", () => {
    expect(colorFor("Transfers", cats)).toBe(TRANSFERS_COLOR);
    expect(colorFor(null, cats)).toBe(UNCATEGORIZED_COLOR);
    expect(colorFor("Uncategorized", cats)).toBe(UNCATEGORIZED_COLOR);
  });
  it("falls back to a hash for unknown names", () => {
    const c = colorFor("Mystery", cats);
    expect(CATEGORY_PALETTE).toContain(c);
    expect(colorFor("Mystery", cats)).toBe(c);
  });
});
