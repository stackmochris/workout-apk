/** Parse a kg entry: up to 2 decimals, comma or dot. '' → null; invalid → undefined. */
export function parseKg(raw: string): number | null | undefined {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** True while typing a value that may still become valid, e.g. "12." */
export function isPartialKg(raw: string): boolean {
  return /^\d{0,4}([.,]\d{0,2})?$/.test(raw.trim());
}

export function parseReps(raw: string): number | null | undefined {
  const s = raw.trim();
  if (s === '') return null;
  return /^\d{1,3}$/.test(s) ? Number(s) : undefined;
}
