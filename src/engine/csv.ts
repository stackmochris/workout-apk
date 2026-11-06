import { fastedWeeklyWeights } from './analytics';
import { weekStart } from './week';
import { BodyEntry, LoggedMovement, Session, SetEntry } from '../types';

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells: unknown[]) => cells.map(csvCell).join(',');

export const SESSION_HEADERS = [
  'date', 'focus', 'type', 'status', 'swap', 'movement_id', 'movement', 'superset', 'set', 'kind', 'weight_kg', 'reps', 'done',
  'duration_min', 'session_notes', 'movement_notes', 'movement_duration_min', 'distance_km', 'effort', 'drop_start_kg', 'drop_end_kg',
];

export const BODY_HEADERS = [
  'date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'energy', 'elbow', 'fasted', 'week_start', 'weekly_fasted_avg',
];

const blank = (v: unknown) => (v == null ? '' : v);

/** Monday of the entry's local week, as YYYY-MM-DD. */
export function weekStartLabel(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
    setIndex, x ? (x.kind ?? 'working') : '', blank(x?.weight), blank(x?.reps), x ? (x.done ? 'yes' : 'no') : '',
    blank(s.durationMin), blank(s.notes), blank(m?.notes), blank(m?.durationMin), blank(distanceKm(s, m)), blank(s.effort),
    blank(x?.dropStart), blank(x?.dropEnd),
  ];
}

/** One row per set. A movement with no sets still gets a row when it has duration, distance, or notes. */
export function sessionRows(sessions: Session[]): unknown[][] {
  const out: unknown[][] = [];
  for (const s of sessions) {
    if (!s.movements.length) { out.push(sessionCells(s, null, '', null)); continue; }
    for (const m of s.movements) {
      if (m.sets.length) m.sets.forEach((x, i) => out.push(sessionCells(s, m, i + 1, x)));
      else if (hasLogWithoutSets(m)) out.push(sessionCells(s, m, '', null));
    }
  }
  return out;
}

export function sessionsTable(sessions: Session[]): unknown[][] {
  return [SESSION_HEADERS, ...sessionRows(sessions)];
}

export function sessionsCsv(sessions: Session[]): string {
  return sessionsTable(sessions).map(line).join('\n') + '\n';
}

/**
 * Body rows sorted by date. week_start is the Monday of that row's week.
 * weekly_fasted_avg is the mean of weights with fasted === true in that week
 * (same grouping as the Progress chart) and is repeated on every row in the week.
 * Weeks with no fasted weight leave the average blank. Missing fasted is not fasted.
 */
export function bodyRows(entries: BodyEntry[]): unknown[][] {
  const averages = new Map<number, number>();
  for (const point of fastedWeeklyWeights(entries)) averages.set(new Date(point.date).getTime(), point.weight);
  return [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const when = new Date(e.date);
    const start = Number.isNaN(when.getTime()) ? null : weekStart(when);
    const avg = start ? averages.get(start.getTime()) : undefined;
    return [
      e.date,
      blank(e.weight),
      blank(e.bodyFat),
      blank(e.waist),
      blank(e.energy),
      blank(e.elbow),
      e.fasted ? 'yes' : '',
      start ? weekStartLabel(start) : '',
      avg ?? '',
    ];
  });
}

export function bodyTable(entries: BodyEntry[]): unknown[][] {
  return [BODY_HEADERS, ...bodyRows(entries)];
}

export function bodyCsv(entries: BodyEntry[]): string {
  return bodyTable(entries).map(line).join('\n') + '\n';
}
