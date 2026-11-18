import { CutLetter, Focus, Movement } from '../types';

export type CutRole = 'compound' | 'isolation';

export interface CutSlot {
  id: string;
  name: string;
  focus: Movement['focus'];
  sets: number;
  repMin: number;
  repMax: number;
  equipment: NonNullable<Movement['equipment']>;
  role: CutRole;
  /** Strength lifts watched for a large estimated-1RM drop. */
  main: boolean;
  notes?: string;
  /** Show the elbow reminder. Does not by itself block a 1–2 RIR load increase. */
  elbow?: boolean;
}

export interface CutDay {
  letter: CutLetter;
  title: string;
  focus: Focus;
  slots: CutSlot[];
}

const slot = (
  id: string,
  name: string,
  focus: Movement['focus'],
  sets: number,
  repMin: number,
  repMax: number,
  equipment: CutSlot['equipment'],
  role: CutRole,
  main: boolean,
  notes?: string,
  elbow = false,
): CutSlot => ({ id, name, focus, sets, repMin, repMax, equipment, role, main, notes, elbow });

/**
 * Chris's fat-loss cut. Four upper-body days. Each one opens with a leg movement
 * so there is no separate leg day. Grips stay neutral for the right elbow.
 */
export const CUT_DAYS: CutDay[] = [
  {
    letter: 'A',
    title: 'Chest + triceps',
    focus: 'Chest',
    slots: [
      slot('cut-goblet-or-hack-squat', 'Goblet or hack squat', 'Leg', 3, 8, 12, 'dumbbell', 'compound', true, 'Goblet squat, or hack squat. Neutral load.'),
      slot('cut-neutral-incline-db-press', 'Neutral-grip incline DB press', 'Chest', 3, 8, 12, 'dumbbell', 'compound', true, 'Neutral grip. No wide-grip pressing.'),
      slot('cut-flat-db-press', 'Flat DB press', 'Chest', 3, 8, 12, 'dumbbell', 'compound', true, 'Neutral or comfortable grip. No wide bar.'),
      slot('cut-cable-fly', 'Cable fly', 'Chest', 3, 12, 15, 'cable', 'isolation', false, 'Full stretch, easy on the elbows.'),
      slot('cut-overhead-rope-triceps', 'Overhead rope triceps extension', 'Arm', 3, 12, 15, 'cable', 'isolation', false, 'Light. Rope only. No skull crushers.', true),
    ],
  },
  {
    letter: 'B',
    title: 'Back + biceps',
    focus: 'Back',
    slots: [
      slot('cut-romanian-deadlift', 'Romanian deadlift', 'Leg', 3, 8, 10, 'barbell', 'compound', true, 'Hinge. Keep the bar close.'),
      slot('cut-neutral-lat-pulldown', 'Neutral-grip lat pulldown', 'Back', 3, 8, 12, 'cable', 'compound', true, 'Neutral grip.'),
      slot('cut-chest-supported-neutral-row', 'Chest-supported neutral row', 'Back', 3, 8, 12, 'machine', 'compound', true, 'Neutral grip, chest supported.'),
      slot('cut-seated-cable-row', 'Seated cable row', 'Back', 3, 10, 12, 'cable', 'compound', true, 'Neutral handle if you have one.'),
      slot('cut-hammer-curl', 'Hammer curl', 'Arm', 3, 10, 12, 'dumbbell', 'isolation', false, 'Neutral grip. No heavy straight-bar curls.', true),
    ],
  },
  {
    letter: 'C',
    title: 'Shoulders + core',
    focus: 'Shoulder',
    slots: [
      slot('cut-leg-press', 'Leg press', 'Leg', 3, 10, 15, 'machine', 'compound', true),
      slot('cut-neutral-db-shoulder-press', 'Neutral-grip DB shoulder press', 'Shoulder', 3, 8, 12, 'dumbbell', 'compound', true, 'Neutral grip. No wide bar.'),
      slot('cut-lateral-raise', 'Lateral raise', 'Shoulder', 3, 12, 15, 'dumbbell', 'isolation', false),
      slot('cut-rear-delt-or-face-pull', 'Rear-delt fly or face pull', 'Shoulder', 3, 12, 15, 'dumbbell', 'isolation', false, 'Rear-delt fly or a face pull.'),
      slot('cut-cable-crunch', 'Cable crunch', 'Conditioning', 3, 12, 15, 'cable', 'isolation', false),
    ],
  },
  {
    letter: 'D',
    title: 'Upper mix',
    focus: 'Freestyle',
    slots: [
      slot('cut-bulgarian-split-squat', 'Bulgarian split squat', 'Leg', 3, 8, 10, 'dumbbell', 'compound', true, 'Each leg.'),
      slot('cut-machine-chest-press', 'Machine chest press', 'Chest', 3, 10, 12, 'machine', 'compound', true, 'Neutral grip. No wide-grip pressing.'),
      slot('cut-assisted-neutral-pull-up', 'Assisted neutral-grip pull-up or close-grip pulldown', 'Back', 3, 6, 10, 'machine', 'compound', true, 'Neutral grip. Pulldown is fine if the pull-up is too much.'),
      slot('cut-incline-db-curl-neutral', 'Incline DB curl (neutral grip)', 'Arm', 3, 10, 12, 'dumbbell', 'isolation', false, 'Neutral grip. No heavy straight-bar curls.', true),
      slot('cut-standing-calf-raise', 'Standing calf raise', 'Leg', 3, 12, 15, 'machine', 'isolation', false),
    ],
  },
];

export const CUT_MOVEMENTS: Movement[] = CUT_DAYS.flatMap((day) => day.slots.map((s) => ({
  id: s.id,
  name: s.name,
  focus: s.focus,
  sets: s.sets,
  repMin: s.repMin,
  repMax: s.repMax,
  target: `${s.sets} × ${s.repMin}–${s.repMax}`,
  flags: s.elbow ? ['elbow'] : [],
  notes: s.notes,
  equipment: s.equipment,
})));

const SLOT_BY_ID = new Map(CUT_DAYS.flatMap((day) => day.slots.map((s) => [s.id, s] as const)));
const DAY_BY_LETTER = new Map(CUT_DAYS.map((day) => [day.letter, day] as const));

export function cutDay(letter: CutLetter): CutDay {
  return DAY_BY_LETTER.get(letter) ?? CUT_DAYS[0];
}

export function cutSlot(movementId: string): CutSlot | undefined {
  return SLOT_BY_ID.get(movementId);
}

export const CUT_MAIN_LIFT_IDS: string[] = CUT_DAYS.flatMap((day) => day.slots.filter((s) => s.main).map((s) => s.id));

export function restFor(role: CutRole): { seconds: number; label: string } {
  return role === 'compound'
    ? { seconds: 150, label: 'Rest 2–3 min' }
    : { seconds: 75, label: 'Rest 60–90 s' };
}
