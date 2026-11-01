import { DayTemplate, SplitType } from '../types';
import { DEFAULT_DAY } from './movements';

const perMuscle: DayTemplate[] = Object.entries(DEFAULT_DAY).map(([name, movements]) => ({
  id: name.toLowerCase(),
  name,
  movements,
}));

const pushPullLegs: DayTemplate[] = [
  { id: 'push', name: 'Push', movements: ['barbell-bench-press-top-set-back-off', 'incline-db-press', 'db-lateral-raise', 'oh-cable-tricep-extension'] },
  { id: 'pull', name: 'Pull', movements: ['lat-pulldown-paused-controlled', 'chest-supported-row-incl-wide-and-neutral-grip', 'face-pull', 'incline-db-curl'] },
  { id: 'legs', name: 'Legs', movements: ['barbell-rdl-db-rdl', 'leg-press-or-hack', 'leg-curl', 'calf-raise'] },
];

const upperLower: DayTemplate[] = [
  { id: 'upper', name: 'Upper', movements: ['barbell-bench-press-top-set-back-off', 'lat-pulldown-paused-controlled', 'db-lateral-raise', 'incline-db-curl'] },
  { id: 'lower', name: 'Lower', movements: ['barbell-rdl-db-rdl', 'leg-press-or-hack', 'leg-curl', 'calf-raise'] },
];

const mixed: DayTemplate[] = [
  { id: 'mixed-a', name: 'Mixed A', movements: ['barbell-bench-press-top-set-back-off', 'chest-supported-row-incl-wide-and-neutral-grip', 'db-lateral-raise', 'leg-press-or-hack'] },
  { id: 'mixed-b', name: 'Mixed B', movements: ['incline-db-press', 'lat-pulldown-paused-controlled', 'face-pull', 'barbell-rdl-db-rdl'] },
];

export const TEMPLATES: Record<SplitType, DayTemplate[]> = {
  'per-muscle': perMuscle,
  'push-pull-legs': pushPullLegs,
  'upper-lower': upperLower,
  mixed,
};

export const SPLIT_LABELS: Record<SplitType, string> = {
  'per-muscle': 'Per muscle group (5-day focus)',
  'push-pull-legs': 'Push / Pull / Legs',
  'upper-lower': 'Upper / Lower',
  mixed: 'Mixed-group workouts',
};
