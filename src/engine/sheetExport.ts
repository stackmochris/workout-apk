import { BodyEntry, Session } from '../types';
import { bodyTable, sessionsTable } from './csv';

/** Create and edit spreadsheets. Enough to create a file; full Drive access is not requested. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const SHEET_TITLE = 'Workout Export';
export const SESSIONS_TAB = 'Sessions';
export const BODY_TAB = 'Body';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetExportError extends Error {
  readonly status?: number;
  readonly offline: boolean;

  constructor(message: string, status?: number, offline = false) {
    super(message);
    this.name = 'SheetExportError';
    this.status = status;
    this.offline = offline;
  }
}

const ID_RE = /^[a-zA-Z0-9-_]+$/;

/** Spreadsheet id from a raw id or a Google Sheets / Drive URL. Returns null when it does not parse. */
export function parseSpreadsheetId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const fromPath = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (fromPath) return fromPath[1];
    const queryId = url.searchParams.get('id');
    if (queryId && ID_RE.test(queryId) && queryId.length >= 20) return queryId;
    return null;
  } catch {
    return ID_RE.test(text) && text.length >= 20 ? text : null;
  }
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

export function isGoogleAccount(providerIds: readonly string[]): boolean {
  return providerIds.includes('google.com');
}

/** Which Google popup to open so the sheet lands in that person's account. */
export function sheetsAuthAction(providerIds: readonly string[] | null): 'reauthenticate' | 'link' | 'sign-in' {
  if (!providerIds) return 'sign-in';
  if (isGoogleAccount(providerIds)) return 'reauthenticate';
  return 'link';
}

export function createSpreadsheetBody() {
  return {
    properties: { title: SHEET_TITLE },
    sheets: [
      { properties: { title: SESSIONS_TAB } },
      { properties: { title: BODY_TAB } },
    ],
  };
}

export function addSheetRequests(existingTitles: string[]) {
  const have = new Set(existingTitles);
  const requests: { addSheet: { properties: { title: string } } }[] = [];
  if (!have.has(SESSIONS_TAB)) requests.push({ addSheet: { properties: { title: SESSIONS_TAB } } });
  if (!have.has(BODY_TAB)) requests.push({ addSheet: { properties: { title: BODY_TAB } } });
  return requests;
}

type Cell = { userEnteredValue?: { stringValue: string } | { numberValue: number } };

function cell(v: unknown): Cell {
  if (typeof v === 'number' && Number.isFinite(v)) return { userEnteredValue: { numberValue: v } };
  if (v == null || v === '') return {};
  return { userEnteredValue: { stringValue: String(v) } };
}

function grid(values: unknown[][]) {
  return values.map((row) => ({ values: row.map(cell) }));
}

/**
 * One batch: wipe each tab, then write headers on row 1 and the current rows
 * under them. Both steps travel together so a failed export leaves the old grid.
 */
export function replaceRequests(sheetIds: { sessions: number; body: number }, sessions: Session[], body: BodyEntry[]) {
  const block = (sheetId: number, values: unknown[][]) => [
    { updateCells: { range: { sheetId }, fields: 'userEnteredValue' } },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: grid(values),
        fields: 'userEnteredValue',
      },
    },
  ];
  return [
    ...block(sheetIds.sessions, sessionsTable(sessions)),
    ...block(sheetIds.body, bodyTable(body)),
  ];
}

type SheetTab = { title: string; sheetId: number };

function readTabs(doc: Record<string, unknown>, key: 'sheets' | 'replies'): SheetTab[] {
  const list = doc[key];
  if (!Array.isArray(list)) return [];
  const out: SheetTab[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const source = key === 'replies' && 'addSheet' in item ? (item as { addSheet?: { properties?: { title?: unknown; sheetId?: unknown } } }).addSheet?.properties : (item as { properties?: { title?: unknown; sheetId?: unknown } }).properties;
    if (typeof source?.title === 'string' && typeof source.sheetId === 'number') out.push({ title: source.title, sheetId: source.sheetId });
  }
  return out;
}

function httpMessage(status: number): string {
  if (status === 401) return 'Google access expired. The sheet was not updated. Try the export again.';
  if (status === 403) return 'This account cannot edit that Google Sheet. Paste a sheet you can edit, or forget the saved sheet. The sheet was not updated.';
  if (status === 404) return 'That Google Sheet was not found. Paste another link, or forget the saved sheet to create a new one. The sheet was not updated.';
  if (status === 429) return 'Google Sheets is busy. The sheet was not updated. Try again in a moment.';
  return 'The Google Sheet was not updated. Try again.';
}

const OFFLINE = 'You are offline. The Google Sheet was not updated.';

export function sheetErrorMessage(error: unknown): string {
  if (error instanceof SheetExportError) return error.message;
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled. The sheet was not updated.';
    case 'auth/popup-blocked':
    case 'auth/operation-not-supported-in-this-environment':
      return 'Allow pop-ups for this site, then export again. The sheet was not updated.';
    case 'auth/network-request-failed':
      return OFFLINE;
    case 'auth/user-mismatch':
      return 'Use the same Google account you are signed in with. The sheet was not updated.';
    case 'auth/credential-already-in-use':
    case 'auth/email-already-in-use':
      return 'That Google account is already used to sign in. Sign out, then export and continue with Google. The sheet was not updated.';
    case 'auth/unauthorized-domain':
      return 'This site is not allowed to use Google sign-in yet. The sheet was not updated.';
    case 'auth/no-sheets-token':
      return 'Google did not grant Sheets access. The sheet was not updated.';
    case 'auth/unavailable':
      return 'Google sign-in is unavailable in this browser. The sheet was not updated.';
    default:
      return 'The Google Sheet was not updated. Try again.';
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function onlineNow(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * Create the workbook when needed, add Sessions and Body if they are missing,
 * then replace both tabs from row 1. Calls onId as soon as the id exists so a
 * later write failure still reuses the same file.
 */
export async function pushWorkoutSheet(opts: {
  token: string;
  spreadsheetId: string | null;
  sessions: Session[];
  body: BodyEntry[];
  fetchImpl?: FetchLike;
  online?: boolean;
  onId?: (id: string) => Promise<void> | void;
}): Promise<{ spreadsheetId: string; created: boolean }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const online = opts.online ?? onlineNow();
  if (!online) throw new SheetExportError(OFFLINE, undefined, true);
  if (!opts.token) throw new SheetExportError('Google did not grant Sheets access. The sheet was not updated.');

  const call = async (url: string, init?: RequestInit) => {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new SheetExportError(OFFLINE, undefined, true);
    }
    if (!res.ok) throw new SheetExportError(httpMessage(res.status), res.status);
    const text = await res.text();
    if (!text) return {} as Record<string, unknown>;
    return JSON.parse(text) as Record<string, unknown>;
  };

  let id = opts.spreadsheetId;
  let created = false;
  if (!id) {
    const createdDoc = await call(SHEETS_BASE, { method: 'POST', body: JSON.stringify(createSpreadsheetBody()) });
    id = typeof createdDoc.spreadsheetId === 'string' ? createdDoc.spreadsheetId : '';
    if (!parseSpreadsheetId(id)) throw new SheetExportError('Google did not return a spreadsheet. The sheet was not updated.');
    created = true;
    await opts.onId?.(id);
  }

  const meta = await call(`${SHEETS_BASE}/${encodeURIComponent(id)}?fields=sheets.properties(sheetId,title)`);
  let tabs = readTabs(meta, 'sheets');
  const missing = addSheetRequests(tabs.map((tab) => tab.title));
  if (missing.length) {
    const added = await call(`${SHEETS_BASE}/${encodeURIComponent(id)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing }),
    });
    tabs = [...tabs, ...readTabs(added, 'replies')];
  }
  const sessionsId = tabs.find((tab) => tab.title === SESSIONS_TAB)?.sheetId;
  const bodyId = tabs.find((tab) => tab.title === BODY_TAB)?.sheetId;
  if (sessionsId == null || bodyId == null) {
    throw new SheetExportError('The Sessions and Body tabs could not be created. The sheet was not updated.');
  }
  await call(`${SHEETS_BASE}/${encodeURIComponent(id)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: replaceRequests({ sessions: sessionsId, body: bodyId }, opts.sessions, opts.body) }),
  });
  return { spreadsheetId: id, created };
}
