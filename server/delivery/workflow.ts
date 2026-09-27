export const ORDER_STATUSES = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "rejected",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type DeliveryType = "delivery" | "pickup";

const allowedNext: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["confirmed", "cancelled", "rejected"],
  confirmed: ["preparing", "cancelled", "rejected"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return from === to || allowedNext[from].includes(to);
}

export function canAssignCourier(
  status: OrderStatus,
  deliveryType: DeliveryType
): boolean {
  return (
    deliveryType === "delivery" &&
    (status === "ready" || status === "out_for_delivery")
  );
}

export function canDispatchDelivery(
  deliveryType: DeliveryType,
  hasActiveCourier: boolean
): boolean {
  return deliveryType !== "delivery" || hasActiveCourier;
}
