import { SetEntry } from '../types';

/** Apply a reps/weight edit. A set counts as done as soon as reps is entered; clearing reps unticks it. */
export function editSet(s: SetEntry, patch: { reps?: number | null; weight?: number | null }): SetEntry {
  const next = { ...s, ...patch };
  return { ...next, done: next.reps != null };
}
