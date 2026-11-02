import { Goal, Movement, Prescription } from '../types';

/** Map a user's goal onto a rep range, falling back to the movement's own range. */
export function repsForGoal(goal: Goal, m: Movement): { repMin: number | null; repMax: number | null } {
  if (goal === 'mixed' || m.repMin == null) return { repMin: m.repMin, repMax: m.repMax };
  if (goal === 'strength') return { repMin: Math.max(3, Math.min(m.repMin, 5)), repMax: Math.max(5, Math.min(m.repMax ?? 6, 6)) };
  if (goal === 'hypertrophy') return { repMin: 8, repMax: 12 };
  if (goal === 'endurance') return { repMin: 12, repMax: m.repMax && m.repMax > 15 ? m.repMax : 20 };
  return { repMin: m.repMin, repMax: m.repMax };
}

export function displayTarget(m: Movement, goal: Goal, override?: Prescription): string {
  const sets = override?.sets ?? m.sets;
  const base = repsForGoal(goal, m);
  const repMin = override?.repMin !== undefined ? override.repMin : base.repMin;
  const repMax = override?.repMax !== undefined ? override.repMax : base.repMax;
  const notes = override?.notes ?? m.notes;

  const range = repMin == null
    ? `${sets} × max`
    : repMin === repMax
      ? `${sets} × ${repMin}`
      : `${sets} × ${repMin}–${repMax}`;

  return notes ? `${range} · ${notes}` : range;
}
