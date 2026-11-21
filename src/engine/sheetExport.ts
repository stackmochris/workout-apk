import { BodyEntry, Session } from '../types';
import { bodyTable, SESSION_HEADERS, sessionsTable } from './csv';

/** Create and edit spreadsheets. Enough to create a file; full Drive access is not requested. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export const SHEET_TITLE = 'Workout Export';
export const SESSIONS_TAB = 'Sessions';
export const BODY_TAB = 'Body';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetExportError extends Error {
  readonly status?: number;
  readonly offline: boolean;
  /** 401, or a 403 that is missing the Sheets scope. Safe to mint a new token and try once more. */
  readonly retryable: boolean;

  constructor(message: string, status?: number, offline = false, retryable = false) {
    super(message);
    this.name = 'SheetExportError';
    this.status = status;
    this.offline = offline;
    this.retryable = retryable || status === 401;
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
 * Letter for the Sessions tab only. Stored sessions keep `letter` unset on a
 * one-off Freestyle workout so cut schedule, deload, and e1RM logic ignore it.
 * The sheet still writes F. A cut day whose focus is Freestyle keeps A–D.
 */
export function sheetSessionTable(sessions: Session[]): unknown[][] {
  const table = sessionsTable(sessions).map((row) => row.slice());
  const letterAt = SESSION_HEADERS.indexOf('session_letter');
  const focusAt = SESSION_HEADERS.indexOf('focus');
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    if (row[focusAt] === 'Freestyle' && (row[letterAt] == null || row[letterAt] === '')) row[letterAt] = 'F';
  }
  return table;
}

const DEFAULT_COLUMNS = 26;
const DEFAULT_ROWS = 1000;

export type GridSnapshot = {
  sheetId: number;
  columnCount: number;
  rowCount: number;
  /** Row 0 is the header when the tab is not empty. */
  values: unknown[][];
};

type UpdateRequest = {
  updateCells: {
    start: { sheetId: number; rowIndex: number; columnIndex: number };
    rows: { values: Cell[] }[];
    fields: 'userEnteredValue';
  };
};

type ExpandRequest = {
  updateSheetProperties: {
    properties: { sheetId: number; gridProperties: { columnCount?: number; rowCount?: number } };
    fields: string;
  };
};

export type SheetUpdatePlan = { expand: ExpandRequest[]; write: UpdateRequest[] };

function writeBlock(sheetId: number, rowIndex: number, columnIndex: number, rows: unknown[][]): UpdateRequest[] {
  if (!rows.length || rows.every((row) => row.length === 0)) return [];
  return [{
    updateCells: {
      start: { sheetId, rowIndex, columnIndex },
      rows: grid(rows),
      fields: 'userEnteredValue',
    },
  }];
}

/** Header cells, without the blank tail Sheets omits. */
export function headerCells(row: unknown[] | undefined): string[] {
  if (!row) return [];
  const cells = row.map((value) => (value == null ? '' : String(value).trim()));
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * Old Workout Export tabs start with the previous header and are missing the
 * columns added later. Anything else is left untouched.
 */
export function planHeaderMigration(existing: string[], wanted: string[]):
  | { ok: true; mode: 'create' | 'current' | 'extend'; addAt: number }
  | { ok: false; message: string } {
  if (existing.length === 0) return { ok: true, mode: 'create', addAt: 0 };
  const prefix = existing.length <= wanted.length && existing.every((header, index) => header === wanted[index]);
  if (!prefix) {
    return {
      ok: false,
      message: 'This sheet\'s header row does not match Workout Export. Nothing on it was changed. Forget the saved sheet in Settings to create a new one, or fix the header. The sheet was not updated.',
    };
  }
  if (existing.length === wanted.length) return { ok: true, mode: 'current', addAt: existing.length };
  return { ok: true, mode: 'extend', addAt: existing.length };
}

/** Identity for a Sessions or Body row. Blank rows do not match. */
export function sheetRowKey(headers: string[], row: unknown[]): string {
  const take = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) return '';
    const value = row[index];
    return value == null ? '' : String(value).trim();
  };
  const parts = headers.includes('movement_id')
    ? [take('date'), take('movement_id'), take('set'), take('kind')]
    : [take('date')];
  if (parts.every((part) => part === '')) return '';
  return parts.join('\u001f');
}

function coalesce(writes: { rowIndex: number; columnIndex: number; row: unknown[] }[]): { rowIndex: number; columnIndex: number; rows: unknown[][] }[] {
  const sorted = [...writes].sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex);
  const out: { rowIndex: number; columnIndex: number; rows: unknown[][] }[] = [];
  for (const write of sorted) {
    const last = out[out.length - 1];
    const width = last?.rows[0]?.length;
    if (last && last.columnIndex === write.columnIndex && last.rowIndex + last.rows.length === write.rowIndex && width === write.row.length) {
      last.rows.push(write.row);
    } else {
      out.push({ rowIndex: write.rowIndex, columnIndex: write.columnIndex, rows: [write.row] });
    }
  }
  return out;
}

/**
 * Update a tab in place. An older header gains the missing columns. Rows already
 * in the sheet stay where they are, including rows the app does not have.
 * Nothing clears the tab.
 */
export function buildSheetUpdates(sheet: GridSnapshot, table: unknown[][]): SheetUpdatePlan {
  const wanted = (table[0] ?? []).map((value) => String(value));
  const existingHeader = headerCells(sheet.values[0]);
  const plan = planHeaderMigration(existingHeader, wanted);
  if (!plan.ok) throw new SheetExportError(plan.message);

  const desiredRows = table.slice(1);
  const existingRows = existingHeader.length ? sheet.values.slice(1) : [];
  const keyHeaders = existingHeader.length ? existingHeader : wanted;
  const slots = new Map<string, number[]>();
  existingRows.forEach((row, index) => {
    const key = sheetRowKey(keyHeaders, row);
    if (!key) return;
    const list = slots.get(key) ?? [];
    list.push(index);
    slots.set(key, list);
  });

  if (plan.mode === 'create') {
    const height = table.length;
    return {
      expand: expandRequests(sheet, wanted.length, height),
      write: writeBlock(sheet.sheetId, 0, 0, table),
    };
  }

  const patches: { rowIndex: number; columnIndex: number; row: unknown[] }[] = [];
  const append: unknown[][] = [];
  for (const desired of desiredRows) {
    const key = sheetRowKey(wanted, desired);
    const slot = key ? slots.get(key)?.shift() : undefined;
    if (slot == null) {
      append.push(desired);
      continue;
    }
    if (plan.mode === 'extend') patches.push({ rowIndex: slot + 1, columnIndex: plan.addAt, row: desired.slice(plan.addAt) });
    else patches.push({ rowIndex: slot + 1, columnIndex: 0, row: desired });
  }

  const write: UpdateRequest[] = [];
  if (plan.mode === 'extend') write.push(...writeBlock(sheet.sheetId, 0, plan.addAt, [wanted.slice(plan.addAt)]));
  for (const block of coalesce(patches)) write.push(...writeBlock(sheet.sheetId, block.rowIndex, block.columnIndex, block.rows));
  const appendAt = sheet.values.length;
  if (append.length) write.push(...writeBlock(sheet.sheetId, appendAt, 0, append));
  const height = Math.max(sheet.values.length, appendAt + append.length);
  return { expand: expandRequests(sheet, wanted.length, height), write };
}

function expandRequests(sheet: GridSnapshot, columns: number, rows: number): ExpandRequest[] {
  const columnCount = sheet.columnCount < columns ? columns : undefined;
  const rowCount = sheet.rowCount < rows ? rows : undefined;
  if (columnCount == null && rowCount == null) return [];
  const fields = [
    columnCount != null ? 'gridProperties.columnCount' : '',
    rowCount != null ? 'gridProperties.rowCount' : '',
  ].filter(Boolean).join(',');
  return [{
    updateSheetProperties: {
      properties: { sheetId: sheet.sheetId, gridProperties: { columnCount, rowCount } },
      fields,
    },
  }];
}

function emptyGrid(sheetId: number): GridSnapshot {
  return { sheetId, columnCount: DEFAULT_COLUMNS, rowCount: DEFAULT_ROWS, values: [] };
}

/** Write Sessions and Body from A1 on an empty workbook. Does not clear a tab. */
export function replaceRequests(sheetIds: { sessions: number; body: number }, sessions: Session[], body: BodyEntry[]) {
  return [
    ...buildSheetUpdates(emptyGrid(sheetIds.sessions), sheetSessionTable(sessions)).write,
    ...buildSheetUpdates(emptyGrid(sheetIds.body), bodyTable(body)).write,
  ];
}

type SheetTab = { title: string; sheetId: number; columnCount: number; rowCount: number };

function gridSize(source: { gridProperties?: { columnCount?: unknown; rowCount?: unknown } } | undefined): { columnCount: number; rowCount: number } {
  const columns = source?.gridProperties?.columnCount;
  const rows = source?.gridProperties?.rowCount;
  return {
    columnCount: typeof columns === 'number' && columns > 0 ? columns : DEFAULT_COLUMNS,
    rowCount: typeof rows === 'number' && rows > 0 ? rows : DEFAULT_ROWS,
  };
}

function readTabs(doc: Record<string, unknown>, key: 'sheets' | 'replies'): SheetTab[] {
  const list = doc[key];
  if (!Array.isArray(list)) return [];
  const out: SheetTab[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const source = key === 'replies' && 'addSheet' in item
      ? (item as { addSheet?: { properties?: { title?: unknown; sheetId?: unknown; gridProperties?: { columnCount?: unknown; rowCount?: unknown } } } }).addSheet?.properties
      : (item as { properties?: { title?: unknown; sheetId?: unknown; gridProperties?: { columnCount?: unknown; rowCount?: unknown } } }).properties;
    if (typeof source?.title === 'string' && typeof source.sheetId === 'number') {
      out.push({ title: source.title, sheetId: source.sheetId, ...gridSize(source) });
    }
  }
  return out;
}

function readValueRanges(doc: Record<string, unknown>): Map<string, unknown[][]> {
  const ranges = doc.valueRanges;
  const out = new Map<string, unknown[][]>();
  if (!Array.isArray(ranges)) return out;
  for (const range of ranges) {
    if (!range || typeof range !== 'object') continue;
    const label = typeof (range as { range?: unknown }).range === 'string' ? (range as { range: string }).range : '';
    const title = label.split('!')[0].replace(/^'|'$/g, '');
    const values = (range as { values?: unknown }).values;
    const rows = Array.isArray(values) ? values.filter((row): row is unknown[] => Array.isArray(row)) : [];
    if (title) out.set(title, rows);
  }
  return out;
}

const EXPIRED = 'Google access expired. The sheet was not updated. Try the export again.';
const SCOPE = 'Google did not grant Sheets access. Try the export again and allow Google Sheets when asked. The sheet was not updated.';

function httpMessage(status: number, scope = false): string {
  if (status === 401) return EXPIRED;
  if (status === 403 && scope) return SCOPE;
  if (status === 403) return 'This account cannot edit that Google Sheet. Paste a sheet you can edit, or forget the saved sheet. The sheet was not updated.';
  if (status === 404) return 'That Google Sheet was not found. Paste another link, or forget the saved sheet to create a new one. The sheet was not updated.';
  if (status === 429) return 'Google Sheets is busy. The sheet was not updated. Try again in a moment.';
  if (status === 400) return 'Google Sheets rejected the update. Nothing was erased. The sheet was not updated. Try again.';
  return 'The Google Sheet was not updated. Try again.';
}

function googleRefusal(status: number, body: unknown): { message: string; retryable: boolean } {
  const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: { message?: unknown; status?: unknown; errors?: { reason?: unknown }[] } }).error : undefined;
  const reason = error?.errors?.find((item) => typeof item?.reason === 'string')?.reason;
  const detail = `${typeof error?.message === 'string' ? error.message : ''} ${typeof error?.status === 'string' ? error.status : ''} ${typeof reason === 'string' ? reason : ''}`;
  const scope = status === 403 && /scope|insufficient/i.test(detail);
  return { message: httpMessage(status, scope), retryable: status === 401 || scope };
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
    case 'auth/account-exists-with-different-credential':
      return 'That Google account is already used to sign in. Sign out, then export and continue with Google. The sheet was not updated.';
    case 'auth/requires-recent-login':
      return 'Your sign-in is too old to connect Google. Sign out, sign in again, then export. The sheet was not updated.';
    case 'auth/unauthorized-domain':
      return 'This site is not allowed to use Google sign-in yet. The sheet was not updated.';
    case 'auth/no-sheets-token':
      return 'Google did not grant Sheets access. Try the export again and allow Google Sheets when asked. The sheet was not updated.';
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
 * then update both tabs in place. An older header gains the new columns.
 * Existing rows are not cleared. Calls onId as soon as the id exists so a
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
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    if (text) {
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = {}; }
    }
    if (!res.ok) {
      const refusal = googleRefusal(res.status, parsed);
      throw new SheetExportError(refusal.message, res.status, false, refusal.retryable);
    }
    return parsed;
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

  const meta = await call(`${SHEETS_BASE}/${encodeURIComponent(id)}?fields=sheets.properties(sheetId,title,gridProperties(columnCount,rowCount))`);
  let tabs = readTabs(meta, 'sheets');
  const missing = addSheetRequests(tabs.map((tab) => tab.title));
  if (missing.length) {
    const added = await call(`${SHEETS_BASE}/${encodeURIComponent(id)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing }),
    });
    tabs = [...tabs, ...readTabs(added, 'replies')];
  }
  const sessionsTab = tabs.find((tab) => tab.title === SESSIONS_TAB);
  const bodyTab = tabs.find((tab) => tab.title === BODY_TAB);
  if (!sessionsTab || !bodyTab) {
    throw new SheetExportError('The Sessions and Body tabs could not be created. The sheet was not updated.');
  }

  const values = await call(`${SHEETS_BASE}/${encodeURIComponent(id)}/values:batchGet?ranges=${encodeURIComponent(SESSIONS_TAB)}&ranges=${encodeURIComponent(BODY_TAB)}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`);
  const stored = readValueRanges(values);
  const plans = [
    buildSheetUpdates({ ...sessionsTab, values: stored.get(SESSIONS_TAB) ?? [] }, sheetSessionTable(opts.sessions)),
    buildSheetUpdates({ ...bodyTab, values: stored.get(BODY_TAB) ?? [] }, bodyTable(opts.body)),
  ];
  const expand = plans.flatMap((plan) => plan.expand);
  const write = plans.flatMap((plan) => plan.write);
  if (expand.length) {
    await call(`${SHEETS_BASE}/${encodeURIComponent(id)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: expand }),
    });
  }
  if (write.length) {
    await call(`${SHEETS_BASE}/${encodeURIComponent(id)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: write }),
    });
  }
  return { spreadsheetId: id, created };
}
