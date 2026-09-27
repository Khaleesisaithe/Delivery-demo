import { describe, expect, it } from "vitest";
import { canEditCustomerOrder, recalculateEditedSubtotal } from "./delivery/orderEditing";
import { getEffectivePriceCents } from "../shared/pricing";

describe("server-authoritative order edit pricing", () => {
  it("uses a valid promotion price and otherwise keeps the regular price", () => {
    expect(getEffectivePriceCents({ priceCents: 3200, isPromotion: true, promotionPriceCents: 2500 })).toBe(2500);
    expect(getEffectivePriceCents({ priceCents: 3200, isPromotion: false, promotionPriceCents: 2500 })).toBe(3200);
    expect(getEffectivePriceCents({ priceCents: 3200, isPromotion: true, promotionPriceCents: null })).toBe(3200);
  });
  it("allows only the owner to edit customer order details", () => {
    expect(canEditCustomerOrder("admin")).toBe(true);
    expect(canEditCustomerOrder("staff")).toBe(false);
    expect(canEditCustomerOrder("user")).toBe(false);
  });
  it("recalculates from stored unit and add-on snapshots", () => {
    const total = recalculateEditedSubtotal(
      [{ id: 8, unitPriceCents: 2500, optionUnitCents: 300 }, { id: 9, unitPriceCents: 1500, optionUnitCents: 0 }],
      [{ id: 8, quantity: 2, note: "sem cebola" }, { id: 9, quantity: 1, note: "" }],
    );
    expect(total).toBe(7100);
  });
  it("rejects missing, duplicate, or out-of-range line edits", () => {
    const stored = [{ id: 8, unitPriceCents: 2500, optionUnitCents: 300 }];
    expect(() => recalculateEditedSubtotal(stored, [])).toThrow(RangeError);
    expect(() => recalculateEditedSubtotal(stored, [{ id: 8, quantity: 1, note: "" }, { id: 8, quantity: 1, note: "" }])).toThrow(RangeError);
    expect(() => recalculateEditedSubtotal(stored, [{ id: 8, quantity: 21, note: "" }])).toThrow(RangeError);
    expect(() => recalculateEditedSubtotal(stored, [{ id: 999, quantity: 1, note: "" }])).toThrow(RangeError);
  });
});
