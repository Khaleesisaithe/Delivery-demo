import { describe, expect, it } from "vitest";
import { calculateSubtotal, calculateTotal, formatBRL } from "../shared/pricing";

describe("delivery pricing", () => {
  it("adds product and per-unit option costs for every quantity", () => {
    expect(calculateSubtotal([{ unitPriceCents: 3290, quantity: 2, options: [{ id: 1, name: "Bacon", priceCents: 500 }] }])).toBe(7580);
  });

  it("supports multiple cart lines and optional choices", () => {
    expect(calculateSubtotal([
      { unitPriceCents: 3290, quantity: 1, options: [] },
      { unitPriceCents: 700, quantity: 2, options: [{ id: 2, name: "Gelo", priceCents: 0 }] },
    ])).toBe(4690);
  });

  it("adds delivery and applies discounts without allowing a negative total", () => {
    expect(calculateTotal(5000, 700, 200)).toBe(5500);
    expect(calculateTotal(100, 0, 1000)).toBe(0);
  });

  it("formats integer cent values as Brazilian currency", () => {
    expect(formatBRL(2990)).toMatch(/R\$\s?29,90/);
  });
});
