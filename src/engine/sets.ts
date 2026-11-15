import { SetEntry } from '../types';

/** Draft edits retain completion state unless explicitly logged or undone. */
export function editSet(s: SetEntry, patch: Partial<SetEntry>): SetEntry {
  const next = { ...s, ...patch };
  return { ...next, done: next.done && next.reps != null };
}
