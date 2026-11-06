import { parseSpreadsheetId } from '../engine/sheetExport';

const key = (uid: string) => `workout-apk:sheet:${uid}`;

export function readLocalSheetId(uid: string, storage: Storage = localStorage): string | null {
  try {
    const raw = storage.getItem(key(uid));
    return raw ? parseSpreadsheetId(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalSheetId(uid: string, spreadsheetId: string, storage: Storage = localStorage) {
  const id = parseSpreadsheetId(spreadsheetId);
  if (!id) return;
  storage.setItem(key(uid), id);
}

export function forgetLocalSheetId(uid: string, storage: Storage = localStorage) {
  storage.removeItem(key(uid));
}

/**
 * Device copy wins so a refresh keeps the same file. A new device has no local
 * id and takes the account copy, then caches it on the device.
 */
export async function resolveSheetId(uid: string, opts: {
  storage?: Storage;
  readRemote: () => Promise<string | null>;
}): Promise<string | null> {
  const storage = opts.storage ?? localStorage;
  const local = readLocalSheetId(uid, storage);
  if (local) return local;
  const remote = parseSpreadsheetId((await opts.readRemote()) ?? '');
  if (remote) writeLocalSheetId(uid, remote, storage);
  return remote;
}
