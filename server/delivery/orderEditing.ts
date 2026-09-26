export type StoredOrderLine = {
  id: number;
  unitPriceCents: number;
  optionUnitCents: number;
};
export type OrderLineEdit = { id: number; quantity: number; note: string };

export function recalculateEditedSubtotal(lines: StoredOrderLine[], edits: OrderLineEdit[]): number {
  if (!lines.length || lines.length !== edits.length) throw new RangeError("The edited lines must match the stored order.");
  const editsById = new Map<number, OrderLineEdit>();
  for (const edit of edits) {
    if (!Number.isInteger(edit.id) || editsById.has(edit.id) || !Number.isInteger(edit.quantity) || edit.quantity < 1 || edit.quantity > 20) {
      throw new RangeError("Invalid or duplicated order-line edit.");
    }
    editsById.set(edit.id, edit);
  }
  let subtotalCents = 0;
  for (const line of lines) {
    const edit = editsById.get(line.id);
    if (!edit || !Number.isSafeInteger(line.unitPriceCents) || !Number.isSafeInteger(line.optionUnitCents) || line.unitPriceCents < 0 || line.optionUnitCents < 0) {
      throw new RangeError("An order line no longer matches its stored snapshot.");
    }
    subtotalCents += (line.unitPriceCents + line.optionUnitCents) * edit.quantity;
  }
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 5_000_000) throw new RangeError("The edited order exceeds the maximum total.");
  return subtotalCents;
}
