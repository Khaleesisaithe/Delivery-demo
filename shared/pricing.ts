export type PricedChoice = { id: number; name: string; priceCents: number };
export type PricedLine = {
  unitPriceCents: number;
  quantity: number;
  options?: PricedChoice[];
};

export function calculateSubtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => {
    const optionTotal = (line.options ?? []).reduce((n, option) => n + option.priceCents, 0);
    return sum + (line.unitPriceCents + optionTotal) * line.quantity;
  }, 0);
}

export function calculateTotal(subtotalCents: number, deliveryFeeCents: number, discountCents = 0): number {
  return Math.max(0, subtotalCents + deliveryFeeCents - discountCents);
}

export function formatBRL(valueInCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}
