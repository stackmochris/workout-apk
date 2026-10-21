import { LoggedMovement, SetEntry } from '../types';

export interface Block { weight: number | null; sets: number; reps: number[] }

/** Append completed GVT sets at one weight. */
export function logBlock(lm: LoggedMovement, weight: number | null, reps: number[]): LoggedMovement {
  const add: SetEntry[] = reps.map((r) => ({ reps: r, weight, done: true }));
  return { ...lm, sets: [...lm.sets.filter((s) => s.done), ...add] };
}

/** Consecutive done sets at the same weight, e.g. 5 @ 50 kg then 5 @ 40 kg. */
export function blocks(sets: SetEntry[]): Block[] {
  const out: Block[] = [];
  for (const s of sets) {
    if (!s.done) continue;
    const last = out[out.length - 1];
    if (last && last.weight === s.weight) { last.sets++; last.reps.push(s.reps ?? 0); }
    else out.push({ weight: s.weight, sets: 1, reps: [s.reps ?? 0] });
  }
  return out;
}

export const doneSets = (lm: LoggedMovement) => lm.sets.filter((s) => s.done).length;

export function blockLabel(b: Block): string {
  const same = b.reps.every((r) => r === b.reps[0]);
  return `${b.sets}×${same ? b.reps[0] : b.reps.join('/')} @ ${b.weight ?? '–'} kg`;
}
