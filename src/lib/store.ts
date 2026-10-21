import { useEffect, useState } from 'react';
import { AppData, freshData, migrate } from '../engine/migrate';
import { bodyCsv, sessionsCsv } from '../engine/csv';
import { autoSnapshot } from './backup';
import { LoggedMovement, Session } from '../types';

const KEY = 'workout-apk:v1';

export type { AppData } from '../engine/migrate';
export { DEFAULT_SETTINGS, freshData } from '../engine/migrate';

export function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : freshData();
  } catch {
    return freshData();
  }
}

export function useAppData() {
  const [data, setData] = useState<AppData>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);
  useEffect(() => {
    const id = setTimeout(() => autoSnapshot(data), 5000);
    return () => clearTimeout(id);
  }, [data.sessions, data.body]); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, setData] as const;
}

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportJson(data: AppData) {
  download(`workout-backup-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export function exportCsv(data: AppData) {
  download(`workout-sets-${stamp()}.csv`, sessionsCsv(data.sessions), 'text/csv');
  if (data.body.length) setTimeout(() => download(`workout-body-${stamp()}.csv`, bodyCsv(data.body), 'text/csv'), 300);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Most recent logged sets for a movement, for "previous" hints. Swap sessions are excluded. */
export function previousFor(sessions: Session[], movementId: string): LoggedMovement | undefined {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.status !== 'completed' || s.swap) continue;
    const m = s.movements.find((x) => x.movementId === movementId);
    if (m && m.sets.some((x) => x.done)) return m;
  }
  return undefined;
}
