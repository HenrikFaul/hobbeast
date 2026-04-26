export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function roundCoord(value: number) {
  return Number(value.toFixed(5));
}
