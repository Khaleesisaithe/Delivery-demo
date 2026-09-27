import { describe, expect, it } from "vitest";
import {
  businessDayBounds,
  businessDayRange,
  businessDateKey,
} from "./delivery/businessDay";
import {
  canAssignCourier,
  canDispatchDelivery,
  canTransitionOrder,
} from "./delivery/workflow";
import {
  getOrderHistoryCutoff,
  isCompletedOrderStatus,
  shouldArchiveOrder,
} from "./delivery/retention";

describe("order lifecycle", () => {
  it("only permits forward operational transitions and cancellation before completion", () => {
    expect(canTransitionOrder("received", "confirmed")).toBe(true);
    expect(canTransitionOrder("confirmed", "preparing")).toBe(true);
    expect(canTransitionOrder("ready", "out_for_delivery")).toBe(true);
    expect(canTransitionOrder("received", "delivered")).toBe(false);
    expect(canTransitionOrder("delivered", "cancelled")).toBe(false);
    expect(canTransitionOrder("preparing", "preparing")).toBe(true);
  });

  it("allows staff to assign or reassign a courier only after a delivery order is ready", () => {
    expect(canAssignCourier("preparing", "delivery")).toBe(false);
    expect(canAssignCourier("ready", "delivery")).toBe(true);
    expect(canAssignCourier("out_for_delivery", "delivery")).toBe(true);
    expect(canAssignCourier("ready", "pickup")).toBe(false);
    expect(canAssignCourier("delivered", "delivery")).toBe(false);
  });

  it("requires an active courier before dispatching a delivery, but not a pickup", () => {
    expect(canDispatchDelivery("delivery", false)).toBe(false);
    expect(canDispatchDelivery("delivery", true)).toBe(true);
    expect(canDispatchDelivery("pickup", false)).toBe(true);
  });
});

describe("completed-order history retention", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");

  it("uses an exact ten-minute cutoff", () => {
    expect(getOrderHistoryCutoff(now).toISOString()).toBe(
      "2026-09-27T11:50:00.000Z"
    );
  });

  it("archives terminal orders only after the cutoff", () => {
    expect(isCompletedOrderStatus("delivered")).toBe(true);
    expect(isCompletedOrderStatus("cancelled")).toBe(true);
    expect(isCompletedOrderStatus("rejected")).toBe(true);
    expect(isCompletedOrderStatus("preparing")).toBe(false);
    expect(
      shouldArchiveOrder("delivered", new Date("2026-09-27T11:49:59.999Z"), now)
    ).toBe(true);
    expect(
      shouldArchiveOrder("delivered", new Date("2026-09-27T11:50:00.000Z"), now)
    ).toBe(false);
    expect(
      shouldArchiveOrder("preparing", new Date("2026-09-27T11:00:00.000Z"), now)
    ).toBe(false);
  });
});

describe("store-local business calendar", () => {
  it("groups instants by the configured store date", () => {
    expect(
      businessDateKey(new Date("2026-09-25T02:30:00.000Z"), "America/Sao_Paulo")
    ).toBe("2026-09-24");
  });

  it("uses a 23-hour local day on spring DST transition", () => {
    const { start, end } = businessDayBounds(
      new Date("2026-03-08T17:00:00.000Z"),
      "America/New_York"
    );
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("uses a 25-hour local day on autumn DST transition", () => {
    const { start, end } = businessDayBounds(
      new Date("2026-11-01T17:00:00.000Z"),
      "America/New_York"
    );
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("limits requested report windows", () => {
    expect(() => businessDayRange(new Date(), "America/Sao_Paulo", 91)).toThrow(
      RangeError
    );
  });
});
