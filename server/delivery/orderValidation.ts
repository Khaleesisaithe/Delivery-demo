export function isFullName(value: string): boolean {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every(part => part.length >= 2);
}

export function isValidBrazilianCep(value: string): boolean {
  return /^\d{5}-?\d{3}$/.test(value.replace(/\s/g, ""));
}
