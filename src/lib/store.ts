import { useEffect, useState } from 'react';
import { initialRotation } from '../engine/rotation';
import { SEED_MOVEMENTS } from '../data/movements';
import { LoggedMovement, Movement, RotationState, Session, Settings } from '../types';

const KEY = 'workout-apk:v1';

export interface AppData {
  version: 1;
  movements: Movement[];
  rotation: RotationState;
  sessions: Session[];
  /** In-progress session for today, keyed by plan so a reload keeps the inputs. */
  draft: { focus: string; type: string; movements: LoggedMovement[]; gvtRepsPerMinute?: number[] } | null;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  restSeconds: 90,
  gvt: { sets: 10, reps: 10, seconds: 60 },
  sound: true,
  vibrate: true,
  summaryThreshold: 4,
  targets: { proteinMin: 160, proteinMax: 180, kcalMin: 1950, kcalMax: 2200, waterGlasses: 8 },
};

export function freshData(): AppData {
  return { version: 1, movements: SEED_MOVEMENTS, rotation: initialRotation(), sessions: [], draft: null, settings: DEFAULT_SETTINGS };
}

export function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshData();
    const d = JSON.parse(raw);
    return { ...freshData(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  } catch {
    return freshData();
  }
}

export function useAppData() {
  const [data, setData] = useState<AppData>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);
  return [data, setData] as const;
}

export function exportJson(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Most recent logged sets for a movement, for "previous" hints. */
export function previousFor(sessions: Session[], movementId: string): LoggedMovement | undefined {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.status !== 'completed') continue;
    const m = s.movements.find((x) => x.movementId === movementId);
    if (m && m.sets.some((x) => x.done)) return m;
  }
  return undefined;
}
