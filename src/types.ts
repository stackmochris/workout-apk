export type Focus = 'Chest' | 'Shoulder' | 'Back' | 'Arm' | 'Leg' | 'HIIT' | 'Crossfit' | 'Freestyle' | 'NoGym';
export const FOCI: Focus[] = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'HIIT', 'Crossfit', 'Freestyle', 'NoGym'];
/** Default rotation stays the original 5 so optional foci are opt-in. */
export const ROTATION_FOCI: Focus[] = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg'];
export type SessionType = 'Normal' | 'GVT';
export type ActivityType = 'gym' | 'run' | 'walk' | 'hike' | 'calisthenics' | 'other';

export type SplitType = 'per-muscle' | 'push-pull-legs' | 'upper-lower' | 'mixed';
export type Theme = 'green' | 'red' | 'blue' | 'gold' | 'templar' | 'jerusalem' | 'union-jack' | 'confederate' | 'pride';
export type Goal = 'strength' | 'hypertrophy' | 'endurance' | 'mixed';

export interface DayTemplate {
  id: string;
  name: string;
  movements: string[]; // movement ids
  notes?: string;
}

export interface UserPrefs {
  split: SplitType;
  templates: DayTemplate[];
  onboarded: boolean;
  name?: string;
}

export interface Movement {
  id: string;
  name: string;
  focus: Focus | 'Conditioning';
  sets: number;
  repMin: number | null;
  repMax: number | null;
  target?: string;
  flags: string[];
  notes?: string;
  equipment?: 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';
}

/** Per-user override for a movement's set/rep guidance. */
export interface Prescription {
  sets?: number;
  repMin?: number | null;
  repMax?: number | null;
  notes?: string;
}

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure';
export const SET_KINDS: SetKind[] = ['working', 'warmup', 'drop', 'failure'];

export interface SetEntry {
  reps: number | null;
  weight: number | null;
  done: boolean;
  kind?: SetKind;
  /** Drop sets: starting weight of the drop. */
  dropStart?: number | null;
  /** Drop sets: finishing weight of the drop. */
  dropEnd?: number | null;
}

export interface LoggedMovement {
  movementId: string;
  name: string;
  sets: SetEntry[];
  superset?: string;
  /** Free-text notes for this movement in this session. */
  notes?: string;
  /** Explicitly finished by the user. Collapses the card and moves it down. */
  finished?: boolean;
  /** When the first set of this movement was completed. Used to order the saved log. */
  performedAt?: string;
}

export interface Session {
  id: string;
  date: string;
  focus: Focus;
  type: SessionType;
  status: 'completed' | 'skipped';
  swap?: boolean;
  movements: LoggedMovement[];
  gvtRepsPerMinute?: number[];
  activity?: ActivityType;
  durationMin?: number;
  distanceKm?: number;
  effort?: number;
  notes?: string;
  author: 'app' | 'assistant';
  updatedAt: string;
}

export interface RotationState {
  order: Focus[];
  nextIndex: number;
  counters: Record<Focus, number>;
}

export interface Settings {
  restSeconds: number;
  gvt: { sets: number; reps: number; seconds: number };
  sound: boolean;
  vibrate: boolean;
  summaryThreshold: number;
  penalty: { barbellKg: number; dumbbellCableKg: number; elbowReps: number; stack: boolean };
  barKg: number;
  plates: number[];
  muscleTarget: number;
  supersetRest: number;
  notifications: boolean;
  targets: { proteinMin: number; proteinMax: number; kcalMin: number; kcalMax: number; waterGlasses: number };
  deload?: boolean;
  frequency: {
    enabled: boolean;
    threshold: number;
    watch: string[];
  };
  theme: Theme;
  /** Drives the set/rep sub-heading shown on each movement. */
  goal: Goal;
  /** Per-movement overrides keyed by movement id. */
  prescriptions?: Record<string, Prescription>;
}

export interface BodyEntry {
  id: string;
  date: string;
  weight?: number;
  bodyFat?: number;
  waist?: number;
  author: 'app' | 'assistant';
  updatedAt: string;
}
