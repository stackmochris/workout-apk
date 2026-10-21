import { Movement, Session, Settings } from '../types';

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 local of the week containing d. */
export function weekStart(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Monday 00:00 local, `weeks` weeks before the week containing d (DST-safe). */
export function weekStartOffset(d: Date, weeks: number): Date {
  const x = weekStart(d);
  x.setDate(x.getDate() - 7 * weeks);
  return x;
}

/** Completed sessions (swaps included) in [start, end). */
export function countBetween(sessions: Session[], start: Date, end: Date): number {
  const a = start.getTime();
  const b = end.getTime();
  return sessions.filter((s) => {
    if (s.status !== 'completed') return false;
    const t = new Date(s.date).getTime();
    return t >= a && t < b;
  }).length;
}

/** Completed sessions this calendar week (Monday start, local time). */
export function weekCount(sessions: Session[], now: Date = new Date()): number {
  return countBetween(sessions, weekStart(now), new Date(weekStart(now).getTime() + 8 * DAY));
}

/** Completed sessions in the previous calendar week. */
export function previousWeekCount(sessions: Session[], now: Date = new Date()): number {
  return countBetween(sessions, weekStartOffset(now, 1), weekStart(now));
}

export interface PenaltySettings {
  barbellKg: number;
  dumbbellCableKg: number;
  elbowReps: number;
  stack: boolean;
}

export const DEFAULT_PENALTY: PenaltySettings = { barbellKg: 2.5, dumbbellCableKg: 1, elbowReps: 2, stack: false };

export interface PenaltyState {
  /** How many consecutive weeks before this one fell short of the target. */
  missedWeeks: number;
  /** Multiplier applied to the amounts: 0 = no penalty. */
  multiplier: number;
  lastWeekCount: number;
}

/**
 * Weeks only count as missed once tracking started, i.e. on or after the week of the first
 * logged session, so a fresh install is not penalised.
 */
export function penaltyState(sessions: Session[], now: Date = new Date(), target = 4, stack = false): PenaltyState {
  const lastWeekCount = previousWeekCount(sessions, now);
  if (!sessions.length) return { missedWeeks: 0, multiplier: 0, lastWeekCount };
  const first = weekStart(new Date(Math.min(...sessions.map((s) => new Date(s.date).getTime())))).getTime();
  let missedWeeks = 0;
  for (let w = 1; ; w++) {
    const start = weekStartOffset(now, w);
    if (start.getTime() < first) break;
    if (countBetween(sessions, start, weekStartOffset(now, w - 1)) >= target) break;
    missedWeeks++;
    if (!stack) break;
  }
  return { missedWeeks, multiplier: stack ? missedWeeks : Math.min(missedWeeks, 1), lastWeekCount };
}

export interface Hint {
  weight: number | null;
  reps: number | null;
  /** What the penalty added, for display. */
  addedKg: number;
  addedReps: number;
}

/** Working-load hint for one set, with any missed-week penalty applied. */
export function penalisedHint(
  movement: Pick<Movement, 'equipment' | 'flags'> | undefined,
  prev: { weight: number | null; reps: number | null } | undefined,
  multiplier: number,
  p: PenaltySettings = DEFAULT_PENALTY,
): Hint {
  const base: Hint = { weight: prev?.weight ?? null, reps: prev?.reps ?? null, addedKg: 0, addedReps: 0 };
  if (!movement || !prev || multiplier <= 0) return base;
  if (movement.flags.includes('elbow')) {
    if (base.reps == null) return base;
    const addedReps = p.elbowReps * multiplier;
    return { ...base, reps: base.reps + addedReps, addedReps };
  }
  const step = movement.equipment === 'barbell' ? p.barbellKg
    : movement.equipment === 'dumbbell' || movement.equipment === 'cable' ? p.dumbbellCableKg : 0;
  if (!step || base.weight == null) return base;
  const addedKg = Math.round(step * multiplier * 100) / 100;
  return { ...base, weight: Math.round((base.weight + addedKg) * 100) / 100, addedKg };
}

