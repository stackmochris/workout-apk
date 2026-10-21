export type Focus = 'Chest' | 'Shoulder' | 'Back' | 'Arm' | 'Leg';
export const FOCI: Focus[] = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg'];
export type SessionType = 'Normal' | 'GVT';

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

export interface SetEntry {
  reps: number | null;
  weight: number | null;
  done: boolean;
}

export interface LoggedMovement {
  movementId: string;
  name: string;
  sets: SetEntry[];
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
  targets: { proteinMin: number; proteinMax: number; kcalMin: number; kcalMax: number; waterGlasses: number };
}
