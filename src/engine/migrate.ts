import { initialRotation } from './rotation';
import { normalizeSupersetGroups } from './superset';
import { DEFAULT_PENALTY } from './week';
import { SEED_MOVEMENTS } from '../data/movements';
import { BodyEntry, LoggedMovement, Movement, RotationState, Session, Settings, Theme } from '../types';

export const DATA_VERSION = 2;

export interface AppData {
  version: 2;
  movements: Movement[];
  rotation: RotationState;
  sessions: Session[];
  draft: { focus: string; type: string; movements: LoggedMovement[]; gvtRepsPerMinute?: number[]; startedAt?: string; lastInputAt?: string } | null;
  settings: Settings;
  body: BodyEntry[];
}

export const DEFAULT_SETTINGS: Settings = {
  restSeconds: 90,
  gvt: { sets: 10, reps: 10, seconds: 60 },
  sound: true,
  vibrate: true,
  summaryThreshold: 4,
  penalty: DEFAULT_PENALTY,
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  muscleTarget: 10,
  supersetRest: 15,
  notifications: false,
  targets: { proteinMin: 160, proteinMax: 180, kcalMin: 1950, kcalMax: 2200, waterGlasses: 8 },
  frequency: {
    enabled: true,
    threshold: 3,
    watch: ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'push', 'pull'],
  },
  theme: 'green',
  displayName: '',
  goal: 'mixed',
  cardioGoal: 'maintenance',
  prescriptions: {},
};

/** Saved "pride" packs are retired; anything else is kept. */
export function normalizeTheme(theme: unknown): Theme {
  if (theme === 'pride' || theme == null || theme === '') return 'green';
  return theme as Theme;
}

export function freshData(): AppData {
  return { version: 2, movements: SEED_MOVEMENTS, rotation: initialRotation(), sessions: [], draft: null, settings: DEFAULT_SETTINGS, body: [] };
}

export function migrate(raw: unknown): AppData {
  const fresh = freshData();
  if (!raw || typeof raw !== 'object') return fresh;
  const d = raw as Partial<AppData> & { version?: number };
  const known = new Set((d.movements ?? []).map((m) => m.id));
  const movements = d.movements?.length ? [...d.movements, ...SEED_MOVEMENTS.filter((m) => !known.has(m.id))] : fresh.movements;
  return {
    ...fresh,
    ...d,
    version: 2,
    movements,
    rotation: d.rotation ?? fresh.rotation,
    sessions: Array.isArray(d.sessions)
      ? d.sessions.map((s) => (s && Array.isArray(s.movements) ? { ...s, movements: normalizeSupersetGroups(s.movements) } : s))
      : [],
    // Superset stays a shared id. Lone ids (a partner was removed) are cleared so the card is a normal movement.
    draft: d.draft && typeof d.draft === 'object' ? { ...d.draft, movements: normalizeSupersetGroups(d.draft.movements) } : d.draft ?? null,
    body: Array.isArray(d.body) ? d.body : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...d.settings,
      penalty: { ...DEFAULT_PENALTY, ...d.settings?.penalty },
      gvt: { ...DEFAULT_SETTINGS.gvt, ...d.settings?.gvt },
      targets: { ...DEFAULT_SETTINGS.targets, ...d.settings?.targets },
      frequency: { ...DEFAULT_SETTINGS.frequency, ...d.settings?.frequency },
      theme: normalizeTheme(d.settings?.theme),
      displayName: d.settings?.displayName ?? '',
      goal: d.settings?.goal ?? 'mixed',
      cardioGoal: d.settings?.cardioGoal ?? 'maintenance',
      prescriptions: d.settings?.prescriptions ?? {},
    },
  };
}
