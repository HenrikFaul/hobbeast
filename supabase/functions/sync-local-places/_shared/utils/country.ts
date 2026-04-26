export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

export function isHungaryCountryCode(value: unknown): boolean {
  const normalized = normalizeCountryCode(value);
  return normalized === 'HU' || normalized === 'HUN' || normalized === 'HUNGARY';
}
