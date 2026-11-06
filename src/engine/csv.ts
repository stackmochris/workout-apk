import { BodyEntry, LoggedMovement, Session, SetEntry } from '../types';

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(csvCell).join(',');

const SESSION_HEADER = [
  'date', 'focus', 'type', 'status', 'swap', 'movement_id', 'movement', 'superset', 'set', 'kind', 'weight_kg', 'reps', 'done',
  'duration_min', 'session_notes', 'movement_notes', 'movement_duration_min', 'distance_km', 'effort', 'drop_start_kg', 'drop_end_kg',
];

/** Movement distance when set, otherwise the session distance. */
function distanceKm(s: Session, m: LoggedMovement | null): number | undefined {
  if (m && m.distanceKm != null) return m.distanceKm;
  return s.distanceKm;
}

function hasLogWithoutSets(m: LoggedMovement): boolean {
  return m.durationMin != null || m.distanceKm != null || (m.notes != null && m.notes.trim() !== '');
}

function sessionCells(s: Session, m: LoggedMovement | null, setIndex: number | '', x: SetEntry | null): unknown[] {
  return [
    s.date, s.focus, s.type, s.status, s.swap ? 'yes' : '',
    m?.movementId ?? '', m?.name ?? '', m?.superset ?? '',
    setIndex, x ? (x.kind ?? 'working') : '', x?.weight, x?.reps, x ? (x.done ? 'yes' : 'no') : '',
    s.durationMin, s.notes, m?.notes, m?.durationMin, distanceKm(s, m), s.effort,
    x?.dropStart, x?.dropEnd,
  ];
}

/** One row per set. A movement with no sets still gets a row when it has duration, distance, or notes. */
export function sessionsCsv(sessions: Session[]): string {
  const out = [row(SESSION_HEADER)];
  for (const s of sessions) {
    if (!s.movements.length) { out.push(row(sessionCells(s, null, '', null))); continue; }
    for (const m of s.movements) {
      if (m.sets.length) m.sets.forEach((x, i) => out.push(row(sessionCells(s, m, i + 1, x))));
      else if (hasLogWithoutSets(m)) out.push(row(sessionCells(s, m, '', null)));
    }
  }
  return out.join('\n') + '\n';
}

export function bodyCsv(entries: BodyEntry[]): string {
  const out = [row(['date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'energy', 'elbow', 'fasted'])];
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    out.push(row([e.date, e.weight, e.bodyFat, e.waist, e.energy, e.elbow, e.fasted ? 'yes' : '']));
  }
  return out.join('\n') + '\n';
}
