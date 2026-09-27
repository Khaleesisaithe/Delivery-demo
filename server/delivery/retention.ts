export const ORDER_HISTORY_DELAY_MS = 10 * 60 * 1000;

export const COMPLETED_ORDER_STATUSES = [
  "delivered",
  "cancelled",
  "rejected",
] as const;

export type CompletedOrderStatus = (typeof COMPLETED_ORDER_STATUSES)[number];

export function getOrderHistoryCutoff(now = new Date()): Date {
  return new Date(now.getTime() - ORDER_HISTORY_DELAY_MS);
}

export function isCompletedOrderStatus(
  status: string
): status is CompletedOrderStatus {
  return COMPLETED_ORDER_STATUSES.some(
    completedStatus => completedStatus === status
  );
}

export function shouldArchiveOrder(
  status: string,
  completedAt: Date,
  now = new Date()
): boolean {
  return (
    isCompletedOrderStatus(status) &&
    completedAt.getTime() < getOrderHistoryCutoff(now).getTime()
  );
}
