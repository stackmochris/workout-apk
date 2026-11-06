import { describe, expect, it } from 'vitest';
import { BodyEntry, Session } from '../types';
import { BODY_HEADERS, SESSION_HEADERS } from './csv';
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
      order.push(method === 'POST' && url.endsWith('/spreadsheets') ? 'create' : url.includes(':batchUpdate') ? 'write' : 'meta');
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
    expect(order).toEqual(['create', 'save', 'meta', 'write']);
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
    const sessionRows = expected[1].updateCells.rows ?? [];
    const bodyRows = expected[3].updateCells.rows ?? [];
    expect(sessionRows[0].values.map((c) => c.userEnteredValue && 'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : '')).toEqual(SESSION_HEADERS);
    expect(bodyRows[0].values.map((c) => c.userEnteredValue && 'stringValue' in c.userEnteredValue ? c.userEnteredValue.stringValue : '')).toEqual(BODY_HEADERS);
    expect(bodyRows[1].values[1]).toEqual({ userEnteredValue: { numberValue: 90 } });
    expect(bodyRows[1].values[6]).toEqual({ userEnteredValue: { stringValue: 'yes' } });
    expect(expected[0]).toEqual({ updateCells: { range: { sheetId: 1 }, fields: 'userEnteredValue' } });
    expect(expected[1].updateCells.start).toEqual({ sheetId: 1, rowIndex: 0, columnIndex: 0 });
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

  it('turns an HTTP refusal into a message that the sheet was not updated', () => {
    expect(sheetErrorMessage(new SheetExportError('That Google Sheet was not found. The sheet was not updated.', 404))).toMatch(/not updated/);
    expect(sheetErrorMessage(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }))).toMatch(/offline/);
    expect(sheetErrorMessage(Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }))).toMatch(/not updated/);
  });
});
