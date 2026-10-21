import { Movement } from '../types';

export type Muscle = 'chest' | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'traps' | 'lats' | 'upperBack' | 'biceps' | 'triceps' | 'abs' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

export const MUSCLES: { id: Muscle; label: string }[] = [
  { id: 'chest', label: 'Chest' }, { id: 'frontDelts', label: 'Front delts' }, { id: 'sideDelts', label: 'Side delts' },
  { id: 'rearDelts', label: 'Rear delts' }, { id: 'traps', label: 'Traps' }, { id: 'lats', label: 'Lats' },
  { id: 'upperBack', label: 'Upper back' }, { id: 'biceps', label: 'Biceps' }, { id: 'triceps', label: 'Triceps' },
  { id: 'abs', label: 'Abs' }, { id: 'quads', label: 'Quads' }, { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' }, { id: 'calves', label: 'Calves' },
];

/** Primary muscles get a full set, secondary half a set. Matched by name keywords. */
const RULES: [RegExp, Muscle[], Muscle[]][] = [
  [/leg press|hack squat|split squat|squat/i, ['quads', 'glutes'], []],
  [/lateral raise|kelso/i, ['sideDelts'], ['traps']],
  [/rear delt|face pull/i, ['rearDelts'], ['upperBack']],
  [/shrug/i, ['traps'], []],
  [/overhead press|pike/i, ['frontDelts'], ['triceps', 'sideDelts']],
  [/dips/i, ['chest', 'triceps'], ['frontDelts']],
  [/push-?up/i, ['chest'], ['triceps', 'frontDelts']],
  [/press|fly|crossover/i, ['chest'], ['frontDelts', 'triceps']],
  [/chin-?up/i, ['lats', 'biceps'], ['upperBack']],
  [/pull-?up|pulldown|pullover/i, ['lats'], ['biceps', 'upperBack']],
  [/row/i, ['upperBack', 'lats'], ['biceps', 'rearDelts']],
  [/pushdown|tricep/i, ['triceps'], []],
  [/curl/i, ['biceps'], []],
  [/rdl/i, ['hamstrings', 'glutes'], ['upperBack']],
  [/leg curl/i, ['hamstrings'], []],
  [/leg extension/i, ['quads'], []],
  [/calf/i, ['calves'], []],
  [/core|plank|leg raise/i, ['abs'], []],
];

const FOCUS_DEFAULT: Record<string, Muscle[]> = {
  Chest: ['chest'], Shoulder: ['sideDelts'], Back: ['lats', 'upperBack'], Arm: ['biceps', 'triceps'], Leg: ['quads', 'hamstrings'],
};

export function musclesFor(m: Pick<Movement, 'name' | 'focus'>): { primary: Muscle[]; secondary: Muscle[] } {
  // Leg curl must win over generic curl, so check it first.
  if (/leg curl/i.test(m.name)) return { primary: ['hamstrings'], secondary: [] };
  const supersetBoth = /pushdown \/ curl/i.test(m.name);
  if (supersetBoth) return { primary: ['biceps', 'triceps'], secondary: [] };
  for (const [re, p, s] of RULES) if (re.test(m.name)) return { primary: p, secondary: s };
  return { primary: FOCUS_DEFAULT[m.focus] ?? [], secondary: [] };
}

/** Muscles a focus day mostly trains, for recovery hints. */
export const FOCUS_MUSCLES: Record<string, Muscle[]> = {
  Chest: ['chest', 'frontDelts', 'triceps'],
  Shoulder: ['sideDelts', 'rearDelts', 'frontDelts', 'traps'],
  Back: ['lats', 'upperBack', 'biceps', 'rearDelts'],
  Arm: ['biceps', 'triceps'],
  Leg: ['quads', 'hamstrings', 'glutes', 'calves'],
};
