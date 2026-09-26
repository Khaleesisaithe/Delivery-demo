import { describe, expect, it } from "vitest";
import { recalculateEditedSubtotal } from "./delivery/orderEditing";

describe("server-authoritative order edit pricing", () => {
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
