import type { User } from 'firebase/auth';
import {
  parseSpreadsheetId,
  pushWorkoutSheet,
  sheetErrorMessage,
  spreadsheetUrl,
} from '../engine/sheetExport';
import type { BodyEntry, Session } from '../types';
import { googleSheetsAccessToken } from './googleAccess';
import { readExportSheetId, writeExportSheetId } from './sheetCloud';
import { readLocalSheetId, writeLocalSheetId } from './sheetId';

const OFFLINE = 'You are offline. The Google Sheet was not updated.';
const BAD_PASTE = 'That is not a Google Sheet link or id. The sheet was not updated.';
const SAVED_CHECK_FAILED = 'Could not check your saved sheet. The sheet was not updated.';
const CREATED = 'Created Workout Export in your Google Drive and wrote your sessions and body stats.';
const UPDATED = 'Updated Workout Export. The same sheet was used.';
const UNSYNCED = ' The link is saved on this device and will sync to your account when you are online.';

export function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Same pre-checks Settings uses before it asks Google for a token. */
export function sheetExportBlocked(pasted: string, online = browserOnline()): string | null {
  if (!online) return OFFLINE;
  const typed = pasted.trim();
  if (typed && !parseSpreadsheetId(typed)) return BAD_PASTE;
  return null;
}

export type WorkoutSheetExportResult =
  | {
      ok: true;
      message: string;
      spreadsheetId: string;
      url: string;
      created: boolean;
      synced: boolean;
    }
  | { ok: false; message: string };

export type ExportWorkoutSheetDeps = {
  user: User | null;
  sessions: Session[];
  body: BodyEntry[];
  /** Raw paste from Settings. Empty means use the saved sheet, or create one. */
  pasted?: string;
  online?: boolean;
  onSpreadsheetId?: (id: string) => void;
  tokenFor?: (user: User | null) => Promise<{ token: string; uid: string }>;
  readLocal?: (uid: string) => string | null;
  writeLocal?: (uid: string, id: string) => void;
  readRemote?: (uid: string) => Promise<string | null>;
  writeRemote?: (uid: string, id: string) => Promise<void>;
  push?: typeof pushWorkoutSheet;
};

/**
 * Settings "Export to Google Sheet", also used after a workout is finished.
 * Uses a spreadsheet id this person already saved or pasted. Otherwise the
 * Sheets API creates Workout Export. There is no built-in spreadsheet id.
 */
export async function exportWorkoutSheet(deps: ExportWorkoutSheetDeps): Promise<WorkoutSheetExportResult> {
  const online = deps.online ?? browserOnline();
  const pasted = deps.pasted ?? '';
  const blocked = sheetExportBlocked(pasted, online);
  if (blocked) return { ok: false, message: blocked };

  const pastedId = parseSpreadsheetId(pasted.trim());
  const tokenFor = deps.tokenFor ?? googleSheetsAccessToken;
  const readLocal = deps.readLocal ?? readLocalSheetId;
  const writeLocal = deps.writeLocal ?? writeLocalSheetId;
  const readRemote = deps.readRemote ?? readExportSheetId;
  const writeRemote = deps.writeRemote ?? writeExportSheetId;
  const push = deps.push ?? pushWorkoutSheet;

  try {
    const access = await tokenFor(deps.user);
    let id = pastedId ?? readLocal(access.uid);
    if (!id) {
      try {
        const remote = parseSpreadsheetId((await readRemote(access.uid)) ?? '');
        if (remote) {
          writeLocal(access.uid, remote);
          id = remote;
        }
      } catch {
        return { ok: false, message: SAVED_CHECK_FAILED };
      }
    }
    if (pastedId) {
      writeLocal(access.uid, pastedId);
      deps.onSpreadsheetId?.(pastedId);
    }
    const result = await push({
      token: access.token,
      spreadsheetId: id,
      sessions: deps.sessions,
      body: deps.body,
      online,
      onId: async (createdId) => {
        writeLocal(access.uid, createdId);
        deps.onSpreadsheetId?.(createdId);
        try { await writeRemote(access.uid, createdId); } catch { /* device copy still blocks a second spreadsheet */ }
      },
    });
    writeLocal(access.uid, result.spreadsheetId);
    deps.onSpreadsheetId?.(result.spreadsheetId);
    let synced = true;
    try {
      await writeRemote(access.uid, result.spreadsheetId);
    } catch {
      synced = false;
    }
    const lead = result.created ? CREATED : UPDATED;
    return {
      ok: true,
      message: synced ? lead : `${lead}${UNSYNCED}`,
      spreadsheetId: result.spreadsheetId,
      url: spreadsheetUrl(result.spreadsheetId),
      created: result.created,
      synced,
    };
  } catch (error) {
    return { ok: false, message: sheetErrorMessage(error) };
  }
}
