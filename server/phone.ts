export function normalizeBrazilPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  throw new RangeError("Informe um telefone brasileiro com DDD; o código do país 55 é opcional.");
}

export function isSupportedBrazilPhone(value: string): boolean {
  try { normalizeBrazilPhone(value); return true; } catch { return false; }
}
