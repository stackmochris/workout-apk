import { Movement } from '../types';

/**
 * Seed movement library. Rep ranges are defaults; the displayed sub-heading is
 * computed from the user's goal + any per-movement override (see prescription.ts).
 */
type Seed = [name: string, sets: number, repMin: number | null, repMax: number | null, equipment: Movement['equipment'], notes?: string, elbow?: boolean];

const E = true;

const seeds: Record<Movement['focus'], Seed[]> = {
  Chest: [
    ['Barbell bench press (top set / back-off)', 3, 5, 8, 'barbell', 'Top set 1×3–5, back-off 2×5'],
    ['Incline DB press', 3, 8, 12, 'dumbbell', 'Deep stretch at the bottom'],
    ['Low-incline DB press', 3, 8, 12, 'dumbbell'],
    ['Incline press, Smith machine (upper-chest bias)', 3, 6, 10, 'machine', 'Submax, done, leave it'],
    ['Cable press (upper-chest bias)', 3, 8, 12, 'cable'],
    ['Deep cable crossover / cable fly', 3, 12, 15, 'cable', 'Full stretch, squeeze across midline'],
    ['Deep DB fly', 3, 12, 15, 'dumbbell'],
    ['Dips', 3, 8, 10, 'bodyweight', 'Controlled into the bottom', E],
    ['Machine / DB press', 2, 6, 10, 'machine'],
    ['Flat DB press', 3, 8, 12, 'dumbbell'],
    ['Close-grip bench press', 3, 6, 10, 'barbell', 'Tricep bias'],
    ['Cable chest fly', 3, 12, 15, 'cable', 'Full stretch'],
    ['Together press', 3, 8, 12, 'dumbbell', 'Palms facing in'],
    ['Landmine press', 3, 8, 12, 'barbell'],
  ],
  Shoulder: [
    ['DB lateral raise', 3, 15, 20, 'dumbbell', 'Constant tension'],
    ['Cable lateral raise (incl. burnout)', 3, 15, 20, 'cable'],
    ['Lateral raise → Kelso shrug', 3, 15, 15, 'dumbbell', '3 rounds'],
    ['Rear delt fly (DB / cable)', 3, 15, 20, 'dumbbell', 'Posture + width'],
    ['Face pull', 3, 15, 20, 'cable', 'Shoulder health'],
    ['Machine overhead press', 3, 6, 10, 'machine'],
    ['DB shrugs', 3, 10, 15, 'dumbbell'],
    ['Overhead barbell press (military)', 3, 5, 8, 'barbell', 'Standing or seated'],
    ['Seated DB overhead press', 3, 6, 10, 'dumbbell'],
    ['Push press', 3, 3, 6, 'barbell', 'Leg drive'],
    ['Cable lateral raise', 3, 12, 20, 'cable'],
    ['Chest-supported lateral raise', 3, 12, 20, 'dumbbell', 'Constant tension'],
    ['Band pull-apart', 3, 15, 25, 'bodyweight', 'Shoulder health'],
    ['Upright row', 3, 8, 12, 'barbell', 'Neutral or wide'],
    ['Arnold press', 3, 8, 12, 'dumbbell'],
  ],
  Back: [
    ['Assisted pull-up (Smith / band) / scapular pull-ups', 3, 10, 12, 'bodyweight', 'AMRAP, band or negatives'],
    ['Neutral-grip pull-ups', 3, null, null, 'bodyweight', '3 × max'],
    ['Chin-ups (supinated, paused bottom)', 3, null, null, 'bodyweight', '3 × max, 1–2 RIR', E],
    ['Lat pulldown (paused / controlled)', 3, 8, 12, 'cable', '1s hold at bottom'],
    ['Straight-arm pulldown / straight-arm cable pullover', 3, 12, 15, 'cable', 'Slow, straight-arm tension'],
    ['Chest-supported row (incl. wide and neutral grip)', 3, 8, 12, 'machine', 'Full squeeze'],
    ['Row (barbell / T-bar / machine)', 3, 8, 12, 'barbell'],
    ['Single-arm lat row', 3, 8, 12, 'dumbbell'],
    ['Close-grip lat pulldown', 3, 8, 12, 'cable', 'Elbows to hips'],
    ['Cable pullover', 3, 10, 15, 'cable'],
    ['Single-arm cable row', 3, 8, 12, 'cable'],
    ['Inverted row', 3, 8, 12, 'bodyweight'],
    ['Deadlift', 3, 3, 6, 'barbell', 'Reset each rep'],
    ['Pendlay row', 3, 5, 8, 'barbell'],
  ],
  Arm: [
    ['DB curls / hammer curls', 3, 10, 15, 'dumbbell', undefined, E],
    ['EZ bar curls', 3, 10, 12, 'barbell', undefined, E],
    ['Incline DB curl', 3, 10, 12, 'dumbbell', 'Arm hanging behind the body', E],
    ['Preacher curl', 3, 10, 12, 'machine', undefined, E],
    ['Bayesian cable curl', 3, 10, 12, 'cable', 'Arm behind body, stretch', E],
    ['OH cable tricep extension', 3, 10, 12, 'cable', '1-sec pause in the stretch', E],
    ['Tricep pushdown / rope pushdown', 2, 12, 20, 'cable', undefined, E],
    ['OH tricep → pushdown (superset)', 3, 12, 15, 'cable', '3–4 rounds', E],
    ['Pushdown / curl superset', 3, 12, 15, 'cable', undefined, E],
    ['Cable curl', 3, 10, 15, 'cable', undefined, E],
    ['V-bar pushdown', 3, 10, 15, 'cable', undefined, E],
    ['Cross-body curl', 3, 10, 15, 'dumbbell', undefined, E],
    ['Concentration curl', 3, 8, 12, 'dumbbell', undefined, E],
    ['Skull crusher', 3, 8, 12, 'barbell', undefined, E],
    ['Cable adduction', 3, 12, 15, 'cable'],
  ],
  Leg: [
    ['Barbell RDL / DB RDL', 3, 6, 8, 'barbell', 'Keep honest at 90 kg, controlled'],
    ['Leg press (or hack)', 3, 15, 20, 'machine', 'Pump only, no grinding'],
    ['Leg curl', 3, 12, 15, 'machine'],
    ['Leg extension', 3, 12, 15, 'machine'],
    ['Calf raise', 3, 12, 20, 'machine'],
    ['Bulgarian split squat', 3, 8, 12, 'dumbbell', 'Per leg'],
    ['Walking lunge', 3, 10, 12, 'dumbbell', 'Per leg'],
    ['Goblet squat', 3, 8, 12, 'dumbbell'],
    ['Hack squat', 3, 8, 12, 'machine'],
    ['Hip thrust', 3, 8, 12, 'barbell'],
    ['Seated calf raise', 3, 12, 20, 'machine'],
    ['Standing calf raise', 3, 10, 15, 'machine'],
  ],
  Conditioning: [
    ['Core (plank / hanging leg raise)', 2, null, null, 'bodyweight'],
    ['Burpees', 2, null, null, 'bodyweight'],
    ['Incline treadmill walk', 1, null, null, 'bodyweight'],
  ],
  HIIT: [
    ['Burpee intervals', 8, 8, 12, 'bodyweight', '20s on / 10s off'],
    ['Mountain climbers', 8, 20, 30, 'bodyweight', '20s on / 10s off'],
    ['Jump squats', 6, 10, 15, 'bodyweight', 'Explosive, land soft'],
    ['High knees', 8, 20, 30, 'bodyweight', '20s on / 10s off'],
    ['Battle ropes', 6, 15, 20, 'bodyweight', 'Alternating waves'],
    ['Kettlebell swings', 5, 12, 20, 'dumbbell', 'Hip drive, not a squat'],
    ['Box jumps', 5, 6, 10, 'bodyweight', 'Step down to reset'],
    ['Sprint intervals', 8, null, null, 'bodyweight', '30s hard / 60s easy'],
    ['Plank jacks', 6, 12, 20, 'bodyweight'],
    ['Jumping lunges', 5, 8, 12, 'bodyweight', 'Per leg'],
    ['Rowing intervals', 6, null, null, 'machine', '250m hard / 60s easy'],
    ['Assault bike', 8, null, null, 'machine', '20s max / 40s easy'],
  ],
  Crossfit: [
    ['Thruster', 5, 5, 8, 'barbell', 'Full squat + press'],
    ['Wall ball', 4, 15, 20, 'dumbbell', 'Squat depth, hit the target'],
    ['Double-unders', 4, 30, 50, 'bodyweight', 'Or single-unders if learning'],
    ['Toes-to-bar', 4, 8, 12, 'bodyweight', 'Kip or strict'],
    ['Power clean', 5, 3, 5, 'barbell', 'Explosive second pull'],
    ['Snatch', 5, 2, 3, 'barbell', 'Or power snatch'],
    ['Pull-up (kipping or strict)', 4, 8, 12, 'bodyweight'],
    ['Handstand push-up', 4, 5, 8, 'bodyweight', 'Or pike on box'],
    ['Box jump-over', 4, 10, 15, 'bodyweight'],
    ['Deadlift', 5, 3, 5, 'barbell', 'Reset each rep'],
    ['Row (calories or meters)', 4, null, null, 'machine', 'e.g. 250m or 15 cal'],
    ['Dumbbell snatch', 4, 6, 10, 'dumbbell', 'Per arm'],
    ['Burpee over bar', 4, 8, 12, 'bodyweight'],
    ['GHD sit-up', 3, 10, 15, 'machine'],
    ['Rope climb', 3, 1, 3, 'bodyweight', 'Or lying rope pulls'],
  ],
  Freestyle: [],
  NoGym: [
    ['Zoned cardio (easy)', 1, null, null, 'bodyweight', 'Zone 2, conversational pace'],
    ['Zoned cardio (moderate)', 1, null, null, 'bodyweight', 'Zone 3, steady'],
    ['Zoned cardio (hard)', 1, null, null, 'bodyweight', 'Zone 4–5 intervals'],
    ['Scenic hike', 1, null, null, 'bodyweight', 'Note distance and elevation'],
    ['Walk', 1, null, null, 'bodyweight', 'Any pace'],
    ['Run', 1, null, null, 'bodyweight', 'Easy or tempo'],
    ['Burpees', 4, 8, 15, 'bodyweight', 'Full or half'],
    ['Push-ups', 4, 10, 20, 'bodyweight'],
    ['Bodyweight squats', 4, 15, 25, 'bodyweight'],
    ['Lunges', 3, 10, 15, 'bodyweight', 'Per leg'],
    ['Stairs', 1, null, null, 'bodyweight', 'Flights or minutes'],
    ['Jump rope', 5, 30, 60, 'bodyweight', 'Seconds or reps'],
    ['Plank', 3, null, null, 'bodyweight', 'Hold time'],
    ['Mobility / stretch', 1, null, null, 'bodyweight', 'Note what you worked'],
  ],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const SEED_MOVEMENTS: Movement[] = Object.entries(seeds).flatMap(([focus, list]) =>
  list.map(([name, sets, repMin, repMax, equipment, notes, elbow]) => ({
    id: slug(name),
    name,
    focus: focus as Movement['focus'],
    sets,
    repMin,
    repMax,
    target: repMin == null ? `${sets} × max` : repMin === repMax ? `${sets} × ${repMin}` : `${sets} × ${repMin}–${repMax}`,
    flags: elbow ? ['elbow'] : [],
    notes,
    equipment,
  })),
);

export const FLAG_INFO: Record<string, { label: string; reminder: string }> = {
  elbow: {
    label: 'Elbow (lateral epicondyle)',
    reminder: 'Neutral grips where possible; add reps before load on curls and pushdowns.',
  },
};

/** Default day templates. Freestyle starts empty. NoGym starts with a few activities. */
export const DEFAULT_DAY: Record<string, string[]> = {
  Chest: ['barbell-bench-press-top-set-back-off', 'incline-db-press', 'deep-cable-crossover-cable-fly', 'dips'],
  Shoulder: ['db-lateral-raise', 'rear-delt-fly-db-cable', 'face-pull', 'machine-overhead-press'],
  Back: ['assisted-pull-up-smith-band-scapular-pull-ups', 'lat-pulldown-paused-controlled', 'chest-supported-row-incl-wide-and-neutral-grip', 'straight-arm-pulldown-straight-arm-cable-pullover'],
  Arm: ['incline-db-curl', 'oh-cable-tricep-extension', 'bayesian-cable-curl', 'tricep-pushdown-rope-pushdown'],
  Leg: ['barbell-rdl-db-rdl', 'leg-press-or-hack', 'leg-curl', 'calf-raise'],
  HIIT: ['burpee-intervals', 'mountain-climbers', 'kettlebell-swings', 'sprint-intervals'],
  Crossfit: ['thruster', 'wall-ball', 'pull-up-kipping-or-strict', 'double-unders'],
  Freestyle: [],
  NoGym: ['zoned-cardio-easy', 'scenic-hike', 'burpees', 'push-ups'],
};

/** 100-rep bodyweight swap defaults (brief §5.13), used in M2. */
export const SWAP_DEFAULTS: Record<string, { name: string; alt?: string }> = {
  Chest: { name: '100 push-ups' },
  Back: { name: '100 inverted rows (table / doorframe)' },
  Leg: { name: '100 split squats (50 per leg)' },
  Shoulder: { name: '100 pike push-ups' },
  Arm: { name: '100 bench / chair dips', alt: '100 diamond push-ups (elbow-friendly)' },
  HIIT: { name: '20 min EMOM (burpees / squats)' },
  Crossfit: { name: '20 min AMRAP (thrusters / pull-ups)' },
  Freestyle: { name: 'Free session' },
  NoGym: { name: 'No-gym session' },
};
