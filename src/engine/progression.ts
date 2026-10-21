import { Movement, SetEntry } from '../types';
import { roundLoadable } from './plates';

export const isWorking = (s: SetEntry) => s.done && (s.kind ?? 'working') === 'working';

/** Default load step by equipment when a lift earns more weight. */
export function loadStep(eq: Movement['equipment']): number {
  return eq === 'barbell' ? 2.5 : eq === 'dumbbell' ? 2 : eq === 'cable' || eq === 'machine' ? 2.5 : 0;
}

export interface Suggestion {
  weight: number | null;
  reps: number | null;
  reason: 'add-weight' | 'add-reps' | 'repeat' | 'none';
}

/**
 * Double progression from the last session's working sets.
 * - Every working set hit the top of the range → add one load step, reset to the bottom of the range.
 * - Otherwise keep the weight and aim for one more rep than the weakest set (capped at the top).
 * Elbow-flagged lifts go reps first: they must reach top + extraReps before load goes up.
 * Barbell loads are rounded to what the plates can make.
 */
export function suggestNext(
  mv: Pick<Movement, 'repMin' | 'repMax' | 'equipment' | 'flags'>,
  prevSets: SetEntry[] | undefined,
  opts: { bar?: number; plates?: number[]; extraReps?: number } = {},
): Suggestion {
  const work = (prevSets ?? []).filter((s) => isWorking(s) && s.reps != null);
  if (!work.length) return { weight: null, reps: mv.repMin, reason: 'none' };
  const weight = Math.max(...work.map((s) => s.weight ?? 0)) || null;
  const atWeight = work.filter((s) => (s.weight ?? 0) === (weight ?? 0));
  const minReps = Math.min(...atWeight.map((s) => s.reps!));
  if (mv.repMax == null || mv.repMin == null) return { weight, reps: minReps + 1, reason: 'add-reps' };
  const elbow = mv.flags.includes('elbow');
  const top = mv.repMax + (elbow ? opts.extraReps ?? 2 : 0);
  if (minReps >= top && weight != null) {
    const step = loadStep(mv.equipment);
    if (!step) return { weight, reps: minReps + 1, reason: 'add-reps' };
    let next = weight + step;
    if (mv.equipment === 'barbell') next = roundLoadable(next, opts.bar ?? 20, opts.plates);
    return { weight: Math.round(next * 100) / 100, reps: mv.repMin, reason: 'add-weight' };
  }
  const reps = Math.min(top, Math.max(mv.repMin, minReps + 1));
  return { weight, reps, reason: reps > minReps ? 'add-reps' : 'repeat' };
}
