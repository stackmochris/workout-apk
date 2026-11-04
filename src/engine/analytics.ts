import { FOCUS_MUSCLES, Muscle, musclesFor } from '../data/muscles';
import { BodyEntry, LoggedMovement, Movement, Session } from '../types';
import { e1rm } from './history';
import { weekStart } from './week';

export interface LiftPoint { date: string; e1rm: number; top: number; volume: number }

/** Extra fatigue load for a hard set inside a real superset (2+ movements sharing an id). */
export const SUPERSET_FATIGUE_MULT = 1.12;

export interface SupersetUsage {
  /** Groups whose id is shared by 2+ movements in a completed session. */
  supersets: number;
  /** Hard sets (done, not warm-up) on movements in those groups. */
  sets: number;
}

/** Ids shared by at least two movements in this session. A lone id is not a superset. */
function supersetIds(movements: Pick<LoggedMovement, 'superset'>[]): Set<string> {
  const counts = new Map<string, number>();
  for (const mv of movements) if (mv.superset) counts.set(mv.superset, (counts.get(mv.superset) ?? 0) + 1);
  const ids = new Set<string>();
  for (const [id, n] of counts) if (n >= 2) ids.add(id);
  return ids;
}

const hardSet = (x: { done: boolean; kind?: string }) => x.done && x.kind !== 'warmup';

/**
 * Superset groups and their hard sets among completed sessions.
 * Pass [start, end) to match a period (Progress uses the same week as "Sets this week").
 */
export function supersetUsage(sessions: Session[], start?: Date, end?: Date): SupersetUsage {
  const a = start?.getTime();
  const b = end?.getTime();
  let supersets = 0;
  let sets = 0;
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const t = new Date(s.date).getTime();
    if ((a != null && t < a) || (b != null && t >= b)) continue;
    const groups = supersetIds(s.movements);
    supersets += groups.size;
    for (const mv of s.movements) {
      if (!mv.superset || !groups.has(mv.superset)) continue;
      sets += mv.sets.filter(hardSet).length;
    }
  }
  return { supersets, sets };
}

const counted = (s: Session) => s.status === 'completed' && !s.swap;

/** Per-session best e1RM, heaviest set and volume (warm-ups excluded) for one lift. */
export function liftSeries(sessions: Session[], movementId: string): LiftPoint[] {
  const out: LiftPoint[] = [];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!counted(s)) continue;
    const mv = s.movements.find((m) => m.movementId === movementId);
    if (!mv) continue;
    let best = 0, top = 0, vol = 0;
    for (const x of mv.sets) {
      if (!x.done || x.weight == null || !x.reps || x.kind === 'warmup') continue;
      best = Math.max(best, e1rm(x.weight, x.reps));
      top = Math.max(top, x.weight);
      vol += x.weight * x.reps;
    }
    if (top > 0) out.push({ date: s.date, e1rm: best, top, volume: Math.round(vol * 100) / 100 });
  }
  return out;
}

/** Lifts with at least one weighted set, most-logged first. */
export function trackedLifts(sessions: Session[]): { id: string; name: string; n: number }[] {
  const m = new Map<string, { id: string; name: string; n: number }>();
  for (const s of sessions) if (counted(s)) for (const mv of s.movements) {
    if (!mv.sets.some((x) => x.done && x.weight != null)) continue;
    const e = m.get(mv.movementId) ?? { id: mv.movementId, name: mv.name, n: 0 };
    e.n++;
    m.set(mv.movementId, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

function nameLookup(movements: Movement[]) {
  const byId = new Map(movements.map((m) => [m.id, m]));
  return (id: string, name: string, focus: string) => byId.get(id) ?? { name, focus: focus as Movement['focus'] };
}

/** Hard sets per muscle in the week containing `now`. Primary = 1 set, secondary = 0.5. Warm-ups excluded. */
export function weeklyMuscleSets(sessions: Session[], movements: Movement[], now = new Date()): Partial<Record<Muscle, number>> {
  const start = weekStart(now).getTime();
  const end = start + 7 * 864e5 + 3600e3;
  const look = nameLookup(movements);
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sessions) {
    const t = new Date(s.date).getTime();
    if (s.status !== 'completed' || t < start || t >= end) continue;
    for (const mv of s.movements) {
      const n = mv.sets.filter((x) => x.done && x.kind !== 'warmup').length;
      if (!n) continue;
      const { primary, secondary } = musclesFor(look(mv.movementId, mv.name, s.focus));
      for (const m of primary) out[m] = (out[m] ?? 0) + n;
      for (const m of secondary) out[m] = (out[m] ?? 0) + n / 2;
    }
  }
  return out;
}

/**
 * Residual fatigue per muscle, 0–1. Each hard set adds load that halves every `halfLifeH` hours.
 * A hard set in a superset (id shared by 2+ movements in that session) counts as SUPERSET_FATIGUE_MULT.
 * 10 fresh straight sets ≈ fully fatigued. A rough model, used for the body map tint and hints only.
 */
export function muscleFatigue(sessions: Session[], movements: Movement[], now = new Date(), halfLifeH = 36): Partial<Record<Muscle, number>> {
  const look = nameLookup(movements);
  const raw: Partial<Record<Muscle, number>> = {};
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const h = (now.getTime() - new Date(s.date).getTime()) / 3600e3;
    if (h < 0 || h > 24 * 7) continue;
    const decay = Math.pow(0.5, h / halfLifeH);
    const groups = supersetIds(s.movements);
    for (const mv of s.movements) {
      const n = mv.sets.filter(hardSet).length;
      if (!n) continue;
      const load = n * (mv.superset && groups.has(mv.superset) ? SUPERSET_FATIGUE_MULT : 1);
      const { primary, secondary } = musclesFor(look(mv.movementId, mv.name, s.focus));
      for (const m of primary) raw[m] = (raw[m] ?? 0) + load * decay;
      for (const m of secondary) raw[m] = (raw[m] ?? 0) + (load / 2) * decay;
    }
  }
  const out: Partial<Record<Muscle, number>> = {};
  for (const [m, v] of Object.entries(raw)) out[m as Muscle] = Math.min(1, v! / 10);
  return out;
}

/** Muscles of a focus that are probably still fatigued (suggestion only). */
export function recoveryHint(focus: string, fatigue: Partial<Record<Muscle, number>>, threshold = 0.35): Muscle[] {
  return (FOCUS_MUSCLES[focus] ?? []).filter((m) => (fatigue[m] ?? 0) >= threshold);
}

/**
 * Late-evening weigh-ins only (22:00–02:59 local), so the trend compares like with like.
 * Entries after midnight count for the previous evening. One value per evening (the last one).
 */
export function eveningWeights(entries: BodyEntry[]): { day: string; date: string; weight: number }[] {
  const byDay = new Map<string, { day: string; date: string; weight: number }>();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.weight == null) continue;
    const d = new Date(e.date);
    const h = d.getHours();
    if (!(h >= 22 || h < 3)) continue;
    const ev = new Date(d);
    if (h < 3) ev.setDate(ev.getDate() - 1);
    const day = `${ev.getFullYear()}-${String(ev.getMonth() + 1).padStart(2, '0')}-${String(ev.getDate()).padStart(2, '0')}`;
    byDay.set(day, { day, date: e.date, weight: e.weight });
  }
  return [...byDay.values()];
}

/** Trailing moving average. */
export function movingAvg(values: number[], n = 7): number[] {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - n + 1), i + 1);
    return Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 100) / 100;
  });
}
