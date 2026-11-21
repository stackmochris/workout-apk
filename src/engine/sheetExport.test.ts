import { describe, expect, it } from 'vitest';
import { BodyEntry, Session } from '../types';
import { BODY_HEADERS, SESSION_HEADERS, sessionRows } from './csv';
import {
  SHEETS_SCOPE,
  SheetExportError,
  addSheetRequests,
  createSpreadsheetBody,
  parseSpreadsheetId,
  pushWorkoutSheet,
  replaceRequests,
  sheetErrorMessage,
  sheetsAuthAction,
  spreadsheetUrl,
} from './sheetExport';

const EXAMPLE = '1krFg3QzANKcy9p2dfA-HtVmnkefrFEUbbiF1O5p_I-w';

const sess = (date: string): Session => ({
  id: date, date, focus: 'Chest', type: 'Normal', status: 'completed', movements: [], author: 'app', updatedAt: date,
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('spreadsheet id', () => {
  it('reads an id or a Sheets URL and ignores anything else', () => {
    expect(parseSpreadsheetId(`  ${EXAMPLE}  `)).toBe(EXAMPLE);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${EXAMPLE}/edit?usp=sharing`)).toBe(EXAMPLE);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${EXAMPLE}/edit#gid=0`)).toBe(EXAMPLE);
    expect(parseSpreadsheetId(`https://drive.google.com/open?id=${EXAMPLE}`)).toBe(EXAMPLE);
    expect(parseSpreadsheetId('')).toBeNull();
    expect(parseSpreadsheetId('Workout Export')).toBeNull();
    expect(parseSpreadsheetId('https://example.com/not-a-sheet')).toBeNull();
    expect(spreadsheetUrl(EXAMPLE)).toBe(`https://docs.google.com/spreadsheets/d/${EXAMPLE}`);
  });

  it('does not treat a saved id as a built-in default', () => {
    expect(parseSpreadsheetId('')).toBeNull();
    expect(SHEETS_SCOPE).toBe('https://www.googleapis.com/auth/spreadsheets');
    expect(SHEETS_SCOPE).not.toContain('drive');
  });
});

describe('sheets auth action', () => {
  it('reauthenticates a Google account, links email, and signs in otherwise', () => {
    expect(sheetsAuthAction(null)).toBe('sign-in');
    expect(sheetsAuthAction(['password'])).toBe('link');
    expect(sheetsAuthAction(['google.com'])).toBe('reauthenticate');
    expect(sheetsAuthAction(['password', 'google.com'])).toBe('reauthenticate');
  });
});

describe('pushWorkoutSheet', () => {
  const tabs = (titles: string[]) => ({
    sheets: titles.map((title, i) => ({ properties: { title, sheetId: i + 1 } })),
  });

  it('creates Workout Export once, then rewrites the same file from row 1', async () => {
    const calls: { url: string; method: string; body?: unknown; auth: string }[] = [];
    const order: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body, auth: String((init?.headers as Record<string, string>).Authorization) });
      order.push(method === 'POST' && url.endsWith('/spreadsheets') ? 'create' : url.includes('values:batchGet') ? 'values' : url.includes(':batchUpdate') ? 'write' : 'meta');
      if (method === 'POST' && url.endsWith('/spreadsheets')) return json({ spreadsheetId: 'createdsheetid000000000001' });
      if (url.includes('fields=')) return json(tabs(['Sessions', 'Body']));
      return json({});
    };
    const sessions = [sess('2026-10-20T08:00:00.000Z')];
    const body: BodyEntry[] = [{ id: 'b', date: '2026-10-20T08:00:00.000Z', weight: 90, fasted: true, author: 'app', updatedAt: '' }];
    let saved = '';
    const first = await pushWorkoutSheet({
      token: 'tok-1',
      spreadsheetId: null,
      sessions,
      body,
      fetchImpl,
      online: true,
      onId: (id) => { saved = id; order.push('save'); },
    });
    expect(first).toEqual({ spreadsheetId: 'createdsheetid000000000001', created: true });
    expect(saved).toBe('createdsheetid000000000001');
    expect(order).toEqual(['create', 'save', 'meta', 'values', 'write']);
    expect(calls[0].body).toEqual(createSpreadsheetBody());
    expect(calls[0].body).toMatchObject({ properties: { title: 'Workout Export' } });
    expect(calls[0].auth).toBe('Bearer tok-1');
    expect(JSON.stringify(calls[0].body)).not.toContain('tok-1');

    const second = await pushWorkoutSheet({
      token: 'tok-2',
      spreadsheetId: first.spreadsheetId,
      sessions,
      body,
      fetchImpl,
      online: true,
      onId: () => { throw new Error('should not create again'); },
    });
    expect(second).toEqual({ spreadsheetId: 'createdsheetid000000000001', created: false });
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/spreadsheets'))).toHaveLength(1);

    const write = calls.filter((c) => c.url.includes(':batchUpdate'));
    expect(write).toHaveLength(2);
    const expected = replaceRequests({ sessions: 1, body: 2 }, sessions, body);
    for (const call of write) expect(call.body).toEqual({ requests: expected });
    const sessionRows = expected[0].updateCells.rows ?? [];
    const bodyRows = expected[1].updateCells.rows ?? [];
    expect(sessionRows[0].values.map((c) => c.userEnteredValue && 'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : '')).toEqual(SESSION_HEADERS);
    expect(bodyRows[0].values.map((c) => c.userEnteredValue && 'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : '')).toEqual(BODY_HEADERS);
    expect(bodyRows[1].values[1]).toEqual({ userEnteredValue: { numberValue: 90 } });
    expect(bodyRows[1].values[6]).toEqual({ userEnteredValue: { stringValue: 'yes' } });
    expect(JSON.stringify(expected)).not.toContain('"range"');
    expect(expected[0].updateCells.start).toEqual({ sheetId: 1, rowIndex: 0, columnIndex: 0 });
    expect(order).toEqual(['create', 'save', 'meta', 'values', 'write', 'meta', 'values', 'write']);
  });

  it('adds Sessions and Body when a pasted file does not have them', async () => {
    const bodies: { requests: { addSheet?: { properties: { title: string } } }[] }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { requests: { addSheet?: { properties: { title: string } } }[] } : null;
      if (body) bodies.push(body);
      if (url.includes('fields=')) return json({ sheets: [{ properties: { title: 'Sheet1', sheetId: 0 } }] });
      if (body?.requests?.[0]?.addSheet) {
        return json({
          replies: body.requests.map((req, i) => ({ addSheet: { properties: { sheetId: 10 + i, title: req.addSheet?.properties.title } } })),
        });
      }
      return json({});
    };
    const result = await pushWorkoutSheet({
      token: 'tok',
      spreadsheetId: EXAMPLE,
      sessions: [],
      body: [],
      fetchImpl,
      online: true,
    });
    expect(result).toEqual({ spreadsheetId: EXAMPLE, created: false });
    expect(bodies[0]).toEqual({ requests: addSheetRequests(['Sheet1']) });
    expect(bodies[1]).toEqual({ requests: replaceRequests({ sessions: 10, body: 11 }, [], []) });
    expect(addSheetRequests(['Sessions', 'Body'])).toEqual([]);
  });

  it('saves the new id before a failed write and does not claim success', async () => {
    let saved = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'POST' && url.endsWith('/spreadsheets')) return json({ spreadsheetId: 'newsheetid00000000000001' });
      if (url.includes('fields=')) return json({ sheets: [{ properties: { title: 'Sessions' } }, { properties: { title: 'Body' } }] });
      return json({ error: 'nope' }, 500);
    };
    await expect(pushWorkoutSheet({
      token: 'tok',
      spreadsheetId: null,
      sessions: [],
      body: [],
      fetchImpl,
      online: true,
      onId: (id) => { saved = id; },
    })).rejects.toBeInstanceOf(SheetExportError);
    expect(saved).toBe('newsheetid00000000000001');
    await expect(pushWorkoutSheet({
      token: 'tok',
      spreadsheetId: null,
      sessions: [],
      body: [],
      fetchImpl,
      online: true,
    })).rejects.toThrow(/not updated/);
  });

  it('does not call Google when offline or signed out of Sheets', async () => {
    const fetchImpl: typeof fetch = async () => { throw new Error('called'); };
    await expect(pushWorkoutSheet({
      token: 'tok', spreadsheetId: 'abc', sessions: [], body: [], fetchImpl, online: false,
    })).rejects.toThrow(/offline/);
    await expect(pushWorkoutSheet({
      token: '', spreadsheetId: null, sessions: [], body: [], fetchImpl, online: true,
    })).rejects.toThrow(/not updated/);
  });

  it('extends an old header in place and leaves every existing row', async () => {
    const oldHeaders = SESSION_HEADERS.slice(0, SESSION_HEADERS.indexOf('session_letter'));
    const kept = sess('2026-10-20T08:00:00.000Z');
    kept.movements = [{ movementId: 'bench', name: 'Bench', sets: [{ weight: 80, reps: 8, done: true, kind: 'working' }] }];
    const added = sess('2026-11-21T08:00:00.000Z');
    added.letter = 'A';
    added.elbowPain = 3;
    added.movements = [{ movementId: 'press', name: 'Press', sets: [{ weight: 24, reps: 12, done: true, kind: 'working', rir: 2 }] }];
    const keptRow = sessionRows([kept])[0].slice(0, oldHeaders.length);
    const manual = oldHeaders.map((header) => {
      if (header === 'date') return '2019-01-01T00:00:00.000Z';
      if (header === 'movement_id') return 'note';
      if (header === 'set') return 1;
      return '';
    });
    const entry: BodyEntry = { id: 'b', date: '2026-10-20T08:00:00.000Z', weight: 90, fasted: true, author: 'app', updatedAt: '' };
    const batches: { requests: { updateCells?: { start: { sheetId: number; rowIndex: number; columnIndex: number }; rows: { values: { userEnteredValue?: { stringValue?: string; numberValue?: number } }[] }[] }; updateSheetProperties?: { properties: { sheetId: number; gridProperties: { columnCount?: number } }; fields: string } }[] }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (url.includes('fields=')) {
        return json({
          sheets: [
            { properties: { title: 'Sessions', sheetId: 1, gridProperties: { columnCount: oldHeaders.length, rowCount: 1000 } } },
            { properties: { title: 'Body', sheetId: 2, gridProperties: { columnCount: 26, rowCount: 1000 } } },
          ],
        });
      }
      if (url.includes('values:batchGet')) {
        return json({
          valueRanges: [
            { range: 'Sessions!A1:U3', values: [oldHeaders, keptRow, manual] },
            { range: "'Body'!A1:I2", values: [BODY_HEADERS, [entry.date, entry.weight, '', '', '', '', 'yes', '', '']] },
          ],
        });
      }
      batches.push(body);
      return json({});
    };

    const result = await pushWorkoutSheet({
      token: 'tok',
      spreadsheetId: EXAMPLE,
      sessions: [kept, added],
      body: [entry],
      fetchImpl,
      online: true,
    });

    expect(result).toEqual({ spreadsheetId: EXAMPLE, created: false });
    expect(JSON.stringify(batches)).not.toContain('"range"');
    expect(batches[0].requests).toEqual([{
      updateSheetProperties: {
        properties: { sheetId: 1, gridProperties: { columnCount: SESSION_HEADERS.length } },
        fields: 'gridProperties.columnCount',
      },
    }]);
    const writes = batches[1].requests.flatMap((request) => request.updateCells ? [request.updateCells] : []);
    const text = (values: { userEnteredValue?: { stringValue?: string; numberValue?: number } }[] | undefined) =>
      values?.map((value) => value.userEnteredValue?.stringValue ?? value.userEnteredValue?.numberValue ?? '');
    const header = writes.find((request) => request.start.sheetId === 1 && request.start.rowIndex === 0);
    expect(header?.start.columnIndex).toBe(oldHeaders.length);
    expect(text(header?.rows[0].values)).toEqual(['session_letter', 'elbow_pain', 'rir']);
    const patched = writes.find((request) => request.start.sheetId === 1 && request.start.rowIndex === 1);
    expect(patched?.start.columnIndex).toBe(oldHeaders.length);
    expect(text(patched?.rows[0].values)).toEqual(['', '', '']);
    expect(writes.some((request) => request.start.sheetId === 1 && request.start.rowIndex === 2)).toBe(false);
    const appended = writes.find((request) => request.start.sheetId === 1 && request.start.rowIndex === 3);
    expect(appended?.start.columnIndex).toBe(0);
    expect(text(appended?.rows[0].values)?.slice(-3)).toEqual(['A', 3, 2]);
    const bodyWrite = writes.find((request) => request.start.sheetId === 2);
    expect(bodyWrite?.start).toEqual({ sheetId: 2, rowIndex: 1, columnIndex: 0 });
    expect(bodyWrite?.rows[0].values[1]).toEqual({ userEnteredValue: { numberValue: 90 } });
  });

  it('does not write when the header is not a Workout Export header', async () => {
    const batches: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('fields=')) {
        return json({
          sheets: [
            { properties: { title: 'Sessions', sheetId: 1, gridProperties: { columnCount: 26, rowCount: 100 } } },
            { properties: { title: 'Body', sheetId: 2, gridProperties: { columnCount: 26, rowCount: 100 } } },
          ],
        });
      }
      if (url.includes('values:batchGet')) {
        return json({
          valueRanges: [
            { range: 'Sessions', values: [['notes', 'only']] },
            { range: 'Body', values: [BODY_HEADERS] },
          ],
        });
      }
      batches.push(init?.body);
      return json({});
    };
    await expect(pushWorkoutSheet({
      token: 'tok',
      spreadsheetId: EXAMPLE,
      sessions: [],
      body: [],
      fetchImpl,
      online: true,
    })).rejects.toThrow(/Nothing on it was changed/);
    expect(batches).toEqual([]);
  });

  it('marks an expired token and a missing Sheets scope as retryable', async () => {
    const expired: typeof fetch = async () => json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
    const expiredError = await pushWorkoutSheet({
      token: 'stale', spreadsheetId: EXAMPLE, sessions: [], body: [], fetchImpl: expired, online: true,
    }).catch((error: unknown) => error);
    expect(expiredError).toBeInstanceOf(SheetExportError);
    expect(expiredError).toMatchObject({ status: 401, retryable: true });
    expect((expiredError as SheetExportError).message).toMatch(/expired/);

    const scope: typeof fetch = async () => json({
      error: { code: 403, message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] },
    }, 403);
    const scopeError = await pushWorkoutSheet({
      token: 'narrow', spreadsheetId: EXAMPLE, sessions: [], body: [], fetchImpl: scope, online: true,
    }).catch((error: unknown) => error);
    expect(scopeError).toMatchObject({ status: 403, retryable: true });
    expect((scopeError as SheetExportError).message).toMatch(/Sheets access/);
  });

  it('turns an HTTP refusal into a message that the sheet was not updated', () => {
    expect(sheetErrorMessage(new SheetExportError('That Google Sheet was not found. The sheet was not updated.', 404))).toMatch(/not updated/);
    expect(sheetErrorMessage(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }))).toMatch(/offline/);
    expect(sheetErrorMessage(Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }))).toMatch(/not updated/);
  });
});

describe('freestyle sheet rows', () => {
  function cellValue(cell: { userEnteredValue?: { stringValue: string } | { numberValue: number } }): string | number {
    const value = cell.userEnteredValue;
    if (!value) return '';
    return 'stringValue' in value ? value.stringValue : value.numberValue;
  }

  function sessionRow(sessions: Session[], index: number): (string | number)[] {
    const requests = replaceRequests({ sessions: 1, body: 2 }, sessions, []);
    const rows = requests[0].updateCells.rows ?? [];
    return (rows[index]?.values ?? []).map(cellValue);
  }

  it('writes one-off Freestyle to Sessions as F without storing a letter', () => {
    const freestyle: Session = {
      id: 'free',
      date: '2026-11-21T18:00:00.000Z',
      focus: 'Freestyle',
      type: 'Normal',
      status: 'completed',
      effort: 6,
      elbowPain: 4,
      movements: [{
        movementId: 'db-press',
        name: 'DB press',
        sets: [{ reps: 10, weight: 22, done: true, rir: 2 }],
      }],
      author: 'app',
      updatedAt: '2026-11-21T18:00:00.000Z',
    };
    const cutDay: Session = {
      ...freestyle,
      id: 'day-d',
      focus: 'Freestyle',
      letter: 'D',
      effort: 5,
      elbowPain: 1,
    };
    const skipped: Session = {
      ...freestyle,
      id: 'free-skip',
      date: '2026-11-21T19:00:00.000Z',
      status: 'skipped',
      movements: [],
      effort: undefined,
      elbowPain: undefined,
    };

    const headers = sessionRow([freestyle], 0);
    const row = sessionRow([freestyle, cutDay, skipped], 1);
    const day = sessionRow([freestyle, cutDay, skipped], 2);
    const skippedRow = sessionRow([freestyle, cutDay, skipped], 3);
    const at = (name: string) => headers.indexOf(name);

    expect(headers).toEqual(SESSION_HEADERS);
    expect(row[at('focus')]).toBe('Freestyle');
    expect(row[at('status')]).toBe('completed');
    expect(row[at('session_letter')]).toBe('F');
    expect(row[at('effort')]).toBe(6);
    expect(row[at('elbow_pain')]).toBe(4);
    expect(row[at('rir')]).toBe(2);
    expect(row[at('weight_kg')]).toBe(22);
    expect(row[at('reps')]).toBe(10);
    expect(day[at('session_letter')]).toBe('D');
    expect(skippedRow[at('focus')]).toBe('Freestyle');
    expect(skippedRow[at('status')]).toBe('skipped');
    expect(skippedRow[at('session_letter')]).toBe('F');
    expect(freestyle.letter).toBeUndefined();
    expect(cutDay.letter).toBe('D');
  });
});
