import { CUT_MAIN_LIFT_IDS, cutDay, cutSlot } from '../data/cut';
import { fastedWeeklyWeights } from './analytics';
import { e1rm } from './history';
import { isWorking } from './progression';
import { weekStart } from './week';
import { BodyEntry, CutLetter, CutSchedule, ProgrammeId, Session, Settings } from '../types';

export const CUT_LETTERS: CutLetter[] = ['A', 'B', 'C', 'D'];
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday, Tuesday, Thursday, Friday. */
export const DEFAULT_CUT_DAYS: CutSchedule = { A: 1, B: 2, C: 4, D: 5 };
/** Week 1 contains the first day of the cut diet. */
export const CUT_ANCHOR = '2026-11-18';
export const LOSS_LIMIT_KG = 1.2;
export const E1RM_DROP_LIMIT = 0.1;
const RECENT_DAYS = 56;

export const CUT_TARGETS: Settings['targets'] = {
  proteinMin: 178,
  proteinMax: 178,
  kcalMin: 1780,
  kcalMax: 1780,
  protein: 178,
  kcal: 1780,
  waterGlasses: 8,
};

const LEGACY_TARGETS = { proteinMin: 160, proteinMax: 180, kcalMin: 1950, kcalMax: 2200 };

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isLegacyTargets(t?: Partial<Settings['targets']> | null): boolean {
  if (!t) return true;
  return t.protein == null && t.kcal == null
    && (t.proteinMin ?? LEGACY_TARGETS.proteinMin) === LEGACY_TARGETS.proteinMin
    && (t.proteinMax ?? LEGACY_TARGETS.proteinMax) === LEGACY_TARGETS.proteinMax
    && (t.kcalMin ?? LEGACY_TARGETS.kcalMin) === LEGACY_TARGETS.kcalMin
    && (t.kcalMax ?? LEGACY_TARGETS.kcalMax) === LEGACY_TARGETS.kcalMax;
}

export function mergeTargets(saved: Partial<Settings['targets']> | undefined, programme: ProgrammeId): Settings['targets'] {
  const water = saved?.waterGlasses ?? CUT_TARGETS.waterGlasses;
  if (isLegacyTargets(saved) && programme === 'cut') return { ...CUT_TARGETS, waterGlasses: water };
  if (isLegacyTargets(saved)) {
    return { ...LEGACY_TARGETS, protein: LEGACY_TARGETS.proteinMax, kcal: LEGACY_TARGETS.kcalMax, waterGlasses: water };
  }
  const proteinMin = saved?.proteinMin ?? CUT_TARGETS.protein;
  const proteinMax = saved?.proteinMax ?? proteinMin;
  const kcalMin = saved?.kcalMin ?? CUT_TARGETS.kcal;
  const kcalMax = saved?.kcalMax ?? kcalMin;
  return {
    proteinMin,
    proteinMax,
    kcalMin,
    kcalMax,
    waterGlasses: water,
    protein: saved?.protein ?? proteinMax,
    kcal: saved?.kcal ?? kcalMax,
  };
}

/** Daily numbers for the home strip. A saved range stays a range until it is edited. */
export function formatDailyTargets(t: Settings['targets']): { kcal: string; protein: string; point: boolean } {
  const point = t.kcalMin === t.kcalMax && t.proteinMin === t.proteinMax;
  return {
    point,
    kcal: t.kcalMin === t.kcalMax ? String(t.kcal ?? t.kcalMin) : `${t.kcalMin}–${t.kcalMax}`,
    protein: t.proteinMin === t.proteinMax ? String(t.protein ?? t.proteinMin) : `${t.proteinMin}–${t.proteinMax}`,
  };
}

export function withDailyTargets(targets: Settings['targets'], patch: { protein?: number; kcal?: number }): Settings['targets'] {
  const protein = patch.protein ?? targets.protein ?? targets.proteinMax;
  const kcal = patch.kcal ?? targets.kcal ?? targets.kcalMax;
  return { ...targets, protein, kcal, proteinMin: protein, proteinMax: protein, kcalMin: kcal, kcalMax: kcal };
}

export function normalizeCutDays(raw?: Partial<CutSchedule> | null): CutSchedule {
  const out: CutSchedule = { ...DEFAULT_CUT_DAYS };
  if (!raw) return out;
  for (const letter of CUT_LETTERS) {
    const n = raw[letter];
    if (typeof n === 'number' && n >= 0 && n <= 6 && Number.isInteger(n)) out[letter] = n;
  }
  return out;
}

/** Put `letter` on `weekday`, and give the letter that already had it the old day. */
export function assignCutDay(schedule: CutSchedule, letter: CutLetter, weekday: number): CutSchedule {
  const next: CutSchedule = { ...schedule, [letter]: weekday };
  for (const other of CUT_LETTERS) {
    if (other !== letter && next[other] === weekday) next[other] = schedule[letter];
  }
  return next;
}

export function chooseProgramme(raw: {
  settings?: { programme?: unknown; displayName?: unknown };
  sessions?: unknown;
}): ProgrammeId {
  const explicit = raw.settings?.programme;
  if (explicit === 'cut' || explicit === 'rotation') return explicit;
  const name = typeof raw.settings?.displayName === 'string' ? raw.settings.displayName.trim().toLowerCase() : '';
  if (name === 'chris' || name.startsWith('chris ')) return 'cut';
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.length : 0;
  return sessions > 0 ? 'rotation' : 'cut';
}

export function withProgramme(settings: Settings, programme: ProgrammeId, today = new Date()): Settings {
  if (programme === 'rotation') return { ...settings, programme };
  const legacy = isLegacyTargets(settings.targets) && settings.programme !== 'cut';
  return {
    ...settings,
    programme: 'cut',
    cutAnchor: settings.cutAnchor || isoDate(today),
    cutDays: normalizeCutDays(settings.cutDays),
    targets: legacy ? { ...CUT_TARGETS, waterGlasses: settings.targets.waterGlasses } : settings.targets,
  };
}

export function cutSessionOn(date: Date, schedule: CutSchedule): CutLetter | null {
  const day = date.getDay();
  return CUT_LETTERS.find((letter) => schedule[letter] === day) ?? null;
}

/** Today's letter, or the next scheduled letter when today is a rest day. */
export function nextCutSession(date: Date, schedule: CutSchedule): { letter: CutLetter; date: Date } {
  for (let i = 0; i <= 7; i++) {
    const when = new Date(date);
    when.setDate(when.getDate() + i);
    when.setHours(12, 0, 0, 0);
    const letter = cutSessionOn(when, schedule);
    if (letter) return { letter, date: when };
  }
  return { letter: 'A', date };
}

/** 1-based week of the cut. Week 1 is the week that contains the anchor date. */
export function programmeWeek(date: Date, anchorIso = CUT_ANCHOR): number {
  const anchor = weekStart(new Date(`${anchorIso}T12:00:00`));
  const now = weekStart(date);
  const days = Math.round((now.getTime() - anchor.getTime()) / 86400000);
  return Math.floor(days / 7) + 1;
}

export function scheduledDeload(date: Date, anchorIso = CUT_ANCHOR): boolean {
  const week = programmeWeek(date, anchorIso);
  return week >= 6 && week % 6 === 0;
}

/**
 * About half the working sets, and never zero. Three sets becomes two.
 * That is the practical half step for this programme's 3-set work.
 */
export function deloadSetCount(sets: number): number {
  if (!Number.isFinite(sets) || sets <= 1) return 1;
  return Math.max(1, Math.round(sets * 0.5));
}

function ordered(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
}

function workingReps(session: Session, movementId: string): { reps: number; name: string } | null {
  if (session.status !== 'completed' || session.swap) return null;
  const movement = session.movements.find((m) => m.movementId === movementId);
  if (!movement) return null;
  const reps = movement.sets
    .filter((set) => isWorking(set) && set.reps != null)
    .map((set) => set.reps!);
  if (!reps.length) return null;
  return { reps: Math.min(...reps), name: movement.name };
}

/** Two consecutive sessions where the weakest working set did fewer reps than the one before. */
export function stalledLifts(sessions: Session[], ids: readonly string[] = CUT_MAIN_LIFT_IDS): { id: string; name: string }[] {
  const sessionsInOrder = ordered(sessions);
  const out: { id: string; name: string }[] = [];
  for (const id of ids) {
    const series: { reps: number; name: string }[] = [];
    for (const session of sessionsInOrder) {
      const point = workingReps(session, id);
      if (point) series.push(point);
    }
    if (series.length < 3) continue;
    const [a, b, c] = series.slice(-3);
    if (b.reps < a.reps && c.reps < b.reps) out.push({ id, name: c.name });
  }
  return out;
}

export interface DeloadPrompt {
  active: boolean;
  week: number;
  scheduled: boolean;
  lifts: { id: string; name: string }[];
}

export function deloadPrompt(sessions: Session[], date = new Date(), anchorIso = CUT_ANCHOR, ids: readonly string[] = CUT_MAIN_LIFT_IDS): DeloadPrompt {
  const week = programmeWeek(date, anchorIso);
  const scheduled = scheduledDeload(date, anchorIso);
  const lifts = stalledLifts(sessions, ids);
  return { active: scheduled || lifts.length > 0, week, scheduled, lifts };
}

export interface LossWarning {
  losses: [number, number];
  weights: [number, number, number];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Fasted weekly averages only. Flags when loss is greater than ~1.2 kg
 * for two consecutive calendar weeks.
 */
export function weeklyLossWarning(entries: BodyEntry[], limit = LOSS_LIMIT_KG): LossWarning | null {
  const points = fastedWeeklyWeights(entries);
  if (points.length < 3) return null;
  const last = points.slice(-3);
  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  if (daysBetween(last[0].date, last[1].date) !== 7 || daysBetween(last[1].date, last[2].date) !== 7) return null;
  const loss1 = round1(last[0].weight - last[1].weight);
  const loss2 = round1(last[1].weight - last[2].weight);
  if (loss1 > limit && loss2 > limit) {
    return { losses: [loss1, loss2], weights: [last[0].weight, last[1].weight, last[2].weight] };
  }
  return null;
}

export interface LiftDrop {
  id: string;
  name: string;
  best: number;
  latest: number;
  drop: number;
}

function sessionE1rm(session: Session, movementId: string): { e1rm: number; name: string } | null {
  if (session.status !== 'completed' || session.swap) return null;
  const movement = session.movements.find((m) => m.movementId === movementId);
  if (!movement) return null;
  let best = 0;
  for (const set of movement.sets) {
    if (!isWorking(set) || set.weight == null || !set.reps) continue;
    best = Math.max(best, e1rm(set.weight, set.reps));
  }
  return best > 0 ? { e1rm: best, name: movement.name } : null;
}

/**
 * Latest estimated 1RM more than 10% under that lift's best in the previous 8 weeks.
 * Warm-ups are ignored. An older best outside the window is not the recent best.
 */
export function e1rmDropWarning(sessions: Session[], ids: readonly string[] = CUT_MAIN_LIFT_IDS, limit = E1RM_DROP_LIMIT): LiftDrop[] {
  const sessionsInOrder = ordered(sessions);
  const out: LiftDrop[] = [];
  for (const id of ids) {
    const points: { date: string; e1rm: number; name: string }[] = [];
    for (const session of sessionsInOrder) {
      const point = sessionE1rm(session, id);
      if (point) points.push({ date: session.date, e1rm: point.e1rm, name: point.name });
    }
    if (points.length < 2) continue;
    const latest = points[points.length - 1];
    const cutoff = new Date(latest.date);
    cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
    const recent = points.slice(0, -1).filter((point) => new Date(point.date) >= cutoff);
    if (!recent.length) continue;
    const best = Math.max(...recent.map((point) => point.e1rm));
    const drop = (best - latest.e1rm) / best;
    if (drop > limit) out.push({ id, name: latest.name, best, latest: latest.e1rm, drop });
  }
  return out;
}

export function setsForSlot(movementId: string, deload: boolean): number {
  const slot = cutSlot(movementId);
  const sets = slot?.sets ?? 3;
  return deload ? deloadSetCount(sets) : sets;
}

export { cutDay, cutSlot };
