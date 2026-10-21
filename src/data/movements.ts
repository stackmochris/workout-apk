import { Movement } from '../types';

/**
 * Seed movement library (brief §3.3). Rep ranges come from the Notion training logs
 * (Phase 1 tracker, The Build Phase 3, Cut Block) and the earlier tracker in stackmochris/Tools.
 * repMax null = AMRAP / max reps. Editable in Settings (M3).
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
  ],
  Shoulder: [
    ['DB lateral raise', 3, 15, 20, 'dumbbell', 'Constant tension'],
    ['Cable lateral raise (incl. burnout)', 3, 15, 20, 'cable'],
    ['Lateral raise → Kelso shrug', 3, 15, 15, 'dumbbell', '3 rounds'],
    ['Rear delt fly (DB / cable)', 3, 15, 20, 'dumbbell', 'Posture + width'],
    ['Face pull', 3, 15, 20, 'cable', 'Shoulder health'],
    ['Machine overhead press', 3, 6, 10, 'machine'],
    ['DB shrugs', 3, 10, 15, 'dumbbell'],
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
  ],
  Leg: [
    ['Barbell RDL / DB RDL', 3, 6, 8, 'barbell', 'Keep honest at 90 kg, controlled'],
    ['Leg press (or hack)', 3, 15, 20, 'machine', 'Pump only, no grinding'],
    ['Leg curl', 3, 12, 15, 'machine'],
    ['Leg extension', 3, 12, 15, 'machine'],
    ['Calf raise', 3, 12, 20, 'machine'],
  ],
  Conditioning: [
    ['Core (plank / hanging leg raise)', 2, null, null, 'bodyweight'],
    ['Burpees', 2, null, null, 'bodyweight'],
    ['Incline treadmill walk', 1, null, null, 'bodyweight'],
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

/** Default day templates: first N movements of each focus. Editable per day via add/swap. */
export const DEFAULT_DAY: Record<string, string[]> = {
  Chest: ['barbell-bench-press-top-set-back-off', 'incline-db-press', 'deep-cable-crossover-cable-fly', 'dips'],
  Shoulder: ['db-lateral-raise', 'rear-delt-fly-db-cable', 'face-pull', 'machine-overhead-press'],
  Back: ['assisted-pull-up-smith-band-scapular-pull-ups', 'lat-pulldown-paused-controlled', 'chest-supported-row-incl-wide-and-neutral-grip', 'straight-arm-pulldown-straight-arm-cable-pullover'],
  Arm: ['incline-db-curl', 'oh-cable-tricep-extension', 'bayesian-cable-curl', 'tricep-pushdown-rope-pushdown'],
  Leg: ['barbell-rdl-db-rdl', 'leg-press-or-hack', 'leg-curl', 'calf-raise'],
};

/** 100-rep bodyweight swap defaults (brief §5.13), used in M2. */
export const SWAP_DEFAULTS: Record<string, { name: string; alt?: string }> = {
  Chest: { name: '100 push-ups' },
  Back: { name: '100 inverted rows (table / doorframe)' },
  Leg: { name: '100 split squats (50 per leg)' },
  Shoulder: { name: '100 pike push-ups' },
  Arm: { name: '100 bench / chair dips', alt: '100 diamond push-ups (elbow-friendly)' },
};
