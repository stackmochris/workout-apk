import { MUSCLES, Muscle, musclesFor } from '../data/muscles';
import { BodyEntry, Movement, Session, SetKind } from '../types';
import { periodWeightAvg } from './analytics';
import { e1rm } from './history';

export interface LiftLine { id: string; name: string; e1rm: number; prevPeriod: number | null; allTimeBefore: number | null; pr: boolean; change: number | null }
export interface MuscleLine { muscle: Muscle; label: string; perWeek: number; status: 'under' | 'on' | 'over' }
export interface Report {
  weeks: number;
  completed: number;
  skipped: number;
  planned: number;
  missed: number;
  volumeKg: number;
  prevVolumeKg: number | null;
  volumeChangePct: number | null;
  lifts: LiftLine[];
  muscles: MuscleLine[];
  body: { weightAvg: number | null; prevWeightAvg: number | null; weightChange: number | null; bodyFatChange: number | null; waistChange: number | null };
  setKinds: Record<SetKind, number>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (iso: string, a: Date, b: Date) => { const t = new Date(iso).getTime(); return t >= a.getTime() && t < b.getTime(); };
const lifting = (s: Session) => s.status === 'completed' && !s.swap;

function volume(ss: Session[]) {
  let v = 0;
  for (const s of ss) if (lifting(s)) for (const m of s.movements) for (const x of m.sets)
    if (x.done && x.weight != null && x.reps && x.kind !== 'warmup') v += x.weight * x.reps;
  return r2(v);
}

function bestE1(ss: Session[]) {
  const out = new Map<string, { name: string; e1: number }>();
  for (const s of ss) if (lifting(s)) for (const m of s.movements) for (const x of m.sets) {
    if (!x.done || x.weight == null || !x.reps || x.kind === 'warmup') continue;
    const e = e1rm(x.weight, x.reps);
    const cur = out.get(m.movementId);
    if (!cur || e > cur.e1) out.set(m.movementId, { name: m.name, e1: e });
  }
  return out;
}

/** Change from the first to the last reading of a field inside [a, b). */
function fieldChange(body: BodyEntry[], k: 'bodyFat' | 'waist', a: Date, b: Date) {
  const xs = body.filter((e) => e[k] != null && inRange(e.date, a, b)).sort((x, y) => x.date.localeCompare(y.date));
  return xs.length >= 2 ? r1(xs[xs.length - 1][k]! - xs[0][k]!) : null;
}

/** Report for [start, end). The previous period is the same length immediately before. */
export function buildReport(
  all: Session[], movements: Movement[], body: BodyEntry[], start: Date, end: Date,
  opts: { perWeek: number; muscleTarget: number },
): Report {
  const weeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 864e5)));
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7 * weeks);
  const period = all.filter((s) => inRange(s.date, start, end));
  const prev = all.filter((s) => inRange(s.date, prevStart, start));
  const before = all.filter((s) => new Date(s.date).getTime() < start.getTime());

  const completed = period.filter((s) => s.status === 'completed').length;
  const planned = weeks * opts.perWeek;
  const volumeKg = volume(period);
  const prevVolumeKg = prev.some(lifting) ? volume(prev) : null;

  const now = bestE1(period), last = bestE1(prev), hist = bestE1(before);
  const lifts: LiftLine[] = [...now.entries()].map(([id, b]) => {
    const p = last.get(id)?.e1 ?? null, h = hist.get(id)?.e1 ?? null;
    return { id, name: b.name, e1rm: b.e1, prevPeriod: p, allTimeBefore: h, pr: h != null && b.e1 > h, change: p != null ? r1(b.e1 - p) : null };
  }).sort((a, b) => Number(b.pr) - Number(a.pr) || (b.change ?? 0) - (a.change ?? 0));

  const byId = new Map(movements.map((m) => [m.id, m]));
  const sets: Partial<Record<Muscle, number>> = {};
  const setKinds: Record<SetKind, number> = { warmup: 0, working: 0, drop: 0, failure: 0 };
  for (const s of period) if (s.status === 'completed') for (const m of s.movements) {
    const done = m.sets.filter((x) => x.done);
    for (const x of done) setKinds[x.kind ?? 'working']++;
    const n = done.filter((x) => x.kind !== 'warmup').length;
    if (!n) continue;
    const { primary, secondary } = musclesFor(byId.get(m.movementId) ?? { name: m.name, focus: s.focus });
    for (const k of primary) sets[k] = (sets[k] ?? 0) + n;
    for (const k of secondary) sets[k] = (sets[k] ?? 0) + n / 2;
  }
  const t = opts.muscleTarget;
  const muscles: MuscleLine[] = MUSCLES.map(({ id, label }) => {
    const perWeek = r1((sets[id] ?? 0) / weeks);
    return { muscle: id, label, perWeek, status: perWeek < t ? 'under' : perWeek > t * 1.5 ? 'over' : 'on' };
  });

  const weightAvg = periodWeightAvg(body, start, end);
  const prevWeightAvg = periodWeightAvg(body, prevStart, start);

  return {
    weeks, completed, skipped: period.filter((s) => s.status === 'skipped').length, planned, missed: Math.max(0, planned - completed),
    volumeKg, prevVolumeKg, volumeChangePct: prevVolumeKg ? r1(((volumeKg - prevVolumeKg) / prevVolumeKg) * 100) : null,
    lifts, muscles,
    body: {
      weightAvg, prevWeightAvg, weightChange: weightAvg != null && prevWeightAvg != null ? r2(weightAvg - prevWeightAvg) : null,
      bodyFatChange: fieldChange(body, 'bodyFat', start, end), waistChange: fieldChange(body, 'waist', start, end),
    },
    setKinds,
  };
}
