import { BodyEntry, Session } from '../types';

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(csvCell).join(',');

/** One row per set. Skipped sessions get a single row with no movement. */
export function sessionsCsv(sessions: Session[]): string {
  const out = [row(['date', 'focus', 'type', 'status', 'swap', 'movement_id', 'movement', 'superset', 'set', 'kind', 'weight_kg', 'reps', 'done'])];
  for (const s of sessions) {
    const base = [s.date, s.focus, s.type, s.status, s.swap ? 'yes' : ''];
    if (!s.movements.length) { out.push(row([...base, '', '', '', '', '', '', '', ''])); continue; }
    for (const m of s.movements) m.sets.forEach((x, i) =>
      out.push(row([...base, m.movementId, m.name, m.superset ?? '', i + 1, x.kind ?? 'working', x.weight, x.reps, x.done ? 'yes' : 'no'])));
  }
  return out.join('\n') + '\n';
}

export function bodyCsv(entries: BodyEntry[]): string {
  const out = [row(['date', 'weight_kg', 'body_fat_pct', 'waist_cm'])];
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) out.push(row([e.date, e.weight, e.bodyFat, e.waist]));
  return out.join('\n') + '\n';
}
