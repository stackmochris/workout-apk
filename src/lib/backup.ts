import { AppData, migrate } from '../engine/migrate';

/** Rolling daily snapshots in localStorage, separate from the live key. Newest first, last 7 days kept. */
const PREFIX = 'workout-apk:backup:';
export const KEEP = 7;

export interface Snapshot { key: string; day: string; sessions: number; bytes: number }

export function snapshotKey(d = new Date()) {
  return PREFIX + `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Keys to drop so only the newest `keep` remain. Pure, for tests. */
export function pruneKeys(keys: string[], keep = KEEP): string[] {
  return [...keys].sort().reverse().slice(keep);
}

export function listSnapshots(storage: Storage = localStorage): Snapshot[] {
  const out: Snapshot[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)!;
    if (!key.startsWith(PREFIX)) continue;
    const raw = storage.getItem(key) ?? '';
    let sessions = 0;
    try { sessions = JSON.parse(raw).sessions?.length ?? 0; } catch { /* corrupt snapshot */ }
    out.push({ key, day: key.slice(PREFIX.length), sessions, bytes: raw.length });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** Write today's snapshot (overwrites earlier ones from today) and prune old days. Never touches the live data. */
export function autoSnapshot(data: AppData, storage: Storage = localStorage, now = new Date()) {
  if (!data.sessions.length && !data.body.length) return;
  try {
    storage.setItem(snapshotKey(now), JSON.stringify({ ...data, draft: null }));
    for (const k of pruneKeys(listSnapshots(storage).map((s) => s.key))) storage.removeItem(k);
  } catch {
    /* quota full: keep going without a snapshot */
  }
}

export function readSnapshot(key: string, storage: Storage = localStorage): AppData | null {
  try { const raw = storage.getItem(key); return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}

/** Parse an exported JSON backup. Throws on anything that is not a workout backup. */
export function parseBackup(text: string): AppData {
  const d = JSON.parse(text);
  if (!d || typeof d !== 'object' || !Array.isArray(d.sessions)) throw new Error('Not a workout backup');
  return migrate(d);
}
