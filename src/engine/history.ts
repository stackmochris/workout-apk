import { Session } from '../types';
import { weekStart } from './week';

export type Group =
  | { kind: 'day'; session: Session }
  | { kind: 'week'; start: Date; end: Date; label: string; sessions: Session[] }
  | { kind: 'month'; start: Date; end: Date; label: string; sessions: Session[]; weeks: Group[] };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Newest first. Sessions in the current (unfinished) week stay as day cards. Each finished week
 * folds into a Week toggle. Once a calendar month has 4 finished weeks (weeks belong to the month
 * of their Monday), those weeks fold into a Month toggle.
 */
export function foldHistory(sessions: Session[], now: Date = new Date()): Group[] {
  const cur = weekStart(now).getTime();
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const days: Group[] = [];
  const weeks = new Map<number, Session[]>();
  for (const s of sorted) {
    const w = weekStart(new Date(s.date)).getTime();
    if (w >= cur) days.push({ kind: 'day', session: s });
    else (weeks.get(w) ?? weeks.set(w, []).get(w)!).push(s);
  }
  const weekGroups = [...weeks.entries()].sort((a, b) => b[0] - a[0]).map(([t, ss]) => {
    const start = new Date(t);
    const end = addDays(start, 7);
    return { kind: 'week' as const, start, end, label: `Week (${dm(start)} – ${dm(addDays(start, 6))})`, sessions: ss };
  });
  // Count finished weeks per month (all calendar weeks, not only ones with sessions).
  const out: Group[] = [...days];
  const byMonth = new Map<string, typeof weekGroups>();
  for (const g of weekGroups) {
    const k = `${g.start.getFullYear()}-${g.start.getMonth()}`;
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(g);
  }
  const emitted = new Set<string>();
  for (const g of weekGroups) {
    const k = `${g.start.getFullYear()}-${g.start.getMonth()}`;
    if (emitted.has(k)) continue;
    const y = g.start.getFullYear(), m = g.start.getMonth();
    const mStart = new Date(y, m, 1);
    const mEnd = new Date(y, m + 1, 1);
    let finished = 0;
    for (let w = weekStart(mStart); w < mEnd; w = addDays(w, 7)) {
      if (w.getMonth() === m && w.getTime() < cur) finished++;
    }
    if (finished >= 4) {
      emitted.add(k);
      const ws = byMonth.get(k)!;
      out.push({ kind: 'month', start: ws[ws.length - 1].start, end: ws[0].end, label: `Month (${MON[m]} ${y})`, sessions: ws.flatMap((x) => x.sessions), weeks: ws });
    } else out.push(g);
  }
  return out;
}

export interface Insights {
  completed: number;
  planned: number;
  volumeKg: number;
  prevVolumeKg: number | null;
  prs: { name: string; kind: 'kg' | 'e1rm'; value: number; previous: number }[];
  drops: { name: string; kg: number; previous: number }[];
}

export const e1rm = (kg: number, reps: number) => Math.round(kg * (1 + reps / 30) * 10) / 10;

type Best = Map<string, { name: string; kg: number; e1: number }>;
function bests(sessions: Session[]): Best {
  const m: Best = new Map();
  for (const s of sessions) {
    if (s.status !== 'completed' || s.swap) continue;
    for (const mv of s.movements) for (const x of mv.sets) {
      if (!x.done || x.weight == null || !x.reps) continue;
      const b = m.get(mv.movementId) ?? { name: mv.name, kg: 0, e1: 0 };
      b.kg = Math.max(b.kg, x.weight);
      b.e1 = Math.max(b.e1, e1rm(x.weight, x.reps));
      m.set(mv.movementId, b);
    }
  }
  return m;
}

const volume = (ss: Session[]) => Math.round(ss.reduce((a, s) => a + (s.status !== 'completed' || s.swap ? 0 : s.movements.reduce((b, mv) =>
  b + mv.sets.reduce((c, x) => c + (x.done && x.weight != null && x.reps ? x.weight * x.reps : 0), 0), 0)), 0) * 100) / 100;

/** Insights for [start, end) from logged data only. Previous period = same length immediately before. */
export function insights(all: Session[], start: Date, end: Date, weeks: number, perWeek: number): Insights {
  const inR = (s: Session, a: Date, b: Date) => { const t = new Date(s.date).getTime(); return t >= a.getTime() && t < b.getTime(); };
  const period = all.filter((s) => inR(s, start, end));
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7 * weeks);
  const prevP = all.filter((s) => inR(s, prevStart, start));
  const before = all.filter((s) => new Date(s.date).getTime() < start.getTime());
  const now = bests(period), hist = bests(before), last = bests(prevP);
  const prs: Insights['prs'] = [];
  const drops: Insights['drops'] = [];
  for (const [id, b] of now) {
    const h = hist.get(id);
    if (h && b.kg > h.kg) prs.push({ name: b.name, kind: 'kg', value: b.kg, previous: h.kg });
    if (h && b.e1 > h.e1) prs.push({ name: b.name, kind: 'e1rm', value: b.e1, previous: h.e1 });
    const l = last.get(id);
    if (l && b.kg < l.kg) drops.push({ name: b.name, kg: b.kg, previous: l.kg });
  }
  return {
    completed: period.filter((s) => s.status === 'completed').length,
    planned: weeks * perWeek,
    volumeKg: volume(period),
    prevVolumeKg: prevP.length ? volume(prevP) : null,
    prs, drops,
  };
}
