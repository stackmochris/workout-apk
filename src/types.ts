export type Focus = 'Chest' | 'Shoulder' | 'Back' | 'Arm' | 'Leg';
export const FOCI: Focus[] = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg'];
export type SessionType = 'Normal' | 'GVT';
export type ActivityType = 'gym' | 'run' | 'walk' | 'hike' | 'calisthenics' | 'other';

export interface Movement {
  id: string;
  name: string;
  focus: Focus | 'Conditioning';
  /** Default prescription, e.g. sets 3, rep range 8-12. repMax null = AMRAP / max. */
  sets: number;
  repMin: number | null;
  repMax: number | null;
  target?: string;
  flags: string[]; // e.g. ['elbow']
  notes?: string;
  /** Load step in kg used by weight suggestions (M2). */
  equipment?: 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';
}

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure';
export const SET_KINDS: SetKind[] = ['working', 'warmup', 'drop', 'failure'];

export interface SetEntry {
  reps: number | null;
  weight: number | null;
  done: boolean;
  /** Missing = working set (records from before pass 3). */
  kind?: SetKind;
}

export interface LoggedMovement {
  movementId: string;
  name: string;
  sets: SetEntry[];
  /** Superset group id: cards sharing an id alternate under one rest timer. */
  superset?: string;
}

export interface Session {
  id: string;
  date: string; // ISO
  focus: Focus;
  type: SessionType;
  status: 'completed' | 'skipped';
  /** 100-rep bodyweight swap: counts toward the week and rotation, excluded from strength trends and PRs. */
  swap?: boolean;
  movements: LoggedMovement[];
  gvtRepsPerMinute?: number[];
  /** Non-gym activity support */
  activity?: ActivityType;
  durationMin?: number;
  distanceKm?: number;
  effort?: number; // 1-10
  notes?: string;
  /** Sync metadata (M4): who wrote the record and when. */
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
  /** Missed-week load penalty (brief §5.14). */
  penalty: { barbellKg: number; dumbbellCableKg: number; elbowReps: number; stack: boolean };
  /** Plate calculator. */
  barKg: number;
  plates: number[];
  /** Working sets per muscle per week. */
  muscleTarget: number;
  /** Seconds between the two halves of a superset. */
  supersetRest: number;
  notifications: boolean;
  targets: { proteinMin: number; proteinMax: number; kcalMin: number; kcalMax: number; waterGlasses: number };
  /** Manual deload flag for the current week */
  deload?: boolean;
}

export interface BodyEntry {
  id: string;
  date: string; // ISO, local time of the weigh-in
  weight?: number;
  bodyFat?: number;
  waist?: number;
  author: 'app' | 'assistant';
  updatedAt: string;
}
