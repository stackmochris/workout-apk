import type { User } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import { SheetExportError, pushWorkoutSheet } from '../engine/sheetExport';
import type { BodyEntry, Session } from '../types';
import { exportWorkoutSheet, sheetExportBlocked, type ExportWorkoutSheetDeps } from './exportWorkoutSheet';

const CREATED_ID = 'createdsheetid00000001';

const session: Session = {
  id: 's1',
  date: '2026-11-06T12:00:00.000Z',
  focus: 'Chest',
  type: 'Normal',
  status: 'completed',
  movements: [],
  author: 'app',
  updatedAt: '2026-11-06T12:00:00.000Z',
};

const body: BodyEntry = {
  id: 'b1',
  date: '2026-11-06T12:00:00.000Z',
  weight: 80,
  author: 'app',
  updatedAt: '2026-11-06T12:00:00.000Z',
};

function harness(over: Partial<ExportWorkoutSheetDeps> = {}) {
  const local = new Map<string, string>();
  const remote = new Map<string, string>();
  const push = vi.fn(async (opts: Parameters<typeof pushWorkoutSheet>[0]) => {
    const id = opts.spreadsheetId ?? CREATED_ID;
    if (!opts.spreadsheetId) await opts.onId?.(id);
    return { spreadsheetId: id, created: !opts.spreadsheetId };
  });
  const tokenFor = vi.fn(async (_user: User | null) => ({ token: 'token', uid: 'chris' }));
  const deps: ExportWorkoutSheetDeps = {
    user: null,
    sessions: [session],
    body: [body],
    online: true,
    tokenFor,
    readLocal: (uid) => local.get(uid) ?? null,
    writeLocal: (uid, id) => { local.set(uid, id); },
    readRemote: async (uid) => remote.get(uid) ?? null,
    writeRemote: async (uid, id) => { remote.set(uid, id); },
    push,
    ...over,
  };
  return { local, remote, push, tokenFor, deps };
}

describe('sheetExportBlocked', () => {
  it('uses the offline and bad-link messages from Settings', () => {
    expect(sheetExportBlocked('not a sheet', false)).toBe('You are offline. The Google Sheet was not updated.');
    expect(sheetExportBlocked('not a sheet', true)).toBe('That is not a Google Sheet link or id. The sheet was not updated.');
    expect(sheetExportBlocked('   ', true)).toBeNull();
  });
});

describe('exportWorkoutSheet', () => {
  it('refuses while offline and does not ask Google or write the sheet', async () => {
    const { deps, tokenFor, push } = harness({ online: false, pasted: 'nope' });
    const result = await exportWorkoutSheet(deps);
    expect(result).toEqual({ ok: false, message: 'You are offline. The Google Sheet was not updated.' });
    expect(tokenFor).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('rejects a paste that is not a sheet id before asking Google', async () => {
    const { deps, tokenFor, push } = harness({ pasted: 'Workout Export' });
    const result = await exportWorkoutSheet(deps);
    expect(result).toEqual({ ok: false, message: 'That is not a Google Sheet link or id. The sheet was not updated.' });
    expect(tokenFor).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('creates a workbook when this person has no saved sheet', async () => {
    const seen: string[] = [];
    const { deps, push, local, remote } = harness({ onSpreadsheetId: (id) => seen.push(id) });
    const result = await exportWorkoutSheet(deps);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].spreadsheetId).toBeNull();
    expect(push.mock.calls[0][0].sessions).toEqual([session]);
    expect(push.mock.calls[0][0].body).toEqual([body]);
    expect(result).toMatchObject({
      ok: true,
      created: true,
      synced: true,
      spreadsheetId: CREATED_ID,
      url: `https://docs.google.com/spreadsheets/d/${CREATED_ID}`,
      message: 'Created Workout Export in your Google Drive and wrote your sessions and body stats.',
    });
    expect(local.get('chris')).toBe(CREATED_ID);
    expect(remote.get('chris')).toBe(CREATED_ID);
    expect(seen).toContain(CREATED_ID);
  });

  it('updates the sheet this person already saved', async () => {
    const saved = 'savedsheetid0000000001';
    const { deps, push, local } = harness();
    local.set('chris', saved);
    const result = await exportWorkoutSheet(deps);
    expect(push.mock.calls[0][0].spreadsheetId).toBe(saved);
    expect(result).toMatchObject({
      ok: true,
      created: false,
      spreadsheetId: saved,
      message: 'Updated Workout Export. The same sheet was used.',
    });
  });

  it('prefers a pasted link over the saved sheet', async () => {
    const saved = 'savedsheetid0000000001';
    const pasted = 'pastedsheetid000000001';
    const { deps, push, local } = harness({ pasted: `https://docs.google.com/spreadsheets/d/${pasted}/edit` });
    local.set('chris', saved);
    const result = await exportWorkoutSheet(deps);
    expect(push.mock.calls[0][0].spreadsheetId).toBe(pasted);
    expect(local.get('chris')).toBe(pasted);
    expect(result).toMatchObject({ ok: true, spreadsheetId: pasted, created: false });
  });

  it('uses the account copy when this device has no id', async () => {
    const remoteId = 'remotesheetid00000001';
    const { deps, push, local, remote } = harness();
    remote.set('chris', remoteId);
    const result = await exportWorkoutSheet(deps);
    expect(push.mock.calls[0][0].spreadsheetId).toBe(remoteId);
    expect(local.get('chris')).toBe(remoteId);
    expect(result).toMatchObject({ ok: true, created: false, spreadsheetId: remoteId });
  });

  it('stops when the saved sheet cannot be checked', async () => {
    const { deps, push } = harness({
      readRemote: async () => { throw new Error('firestore down'); },
    });
    const result = await exportWorkoutSheet(deps);
    expect(result).toEqual({ ok: false, message: 'Could not check your saved sheet. The sheet was not updated.' });
    expect(push).not.toHaveBeenCalled();
  });

  it('passes the signed-in user through to the Sheets token', async () => {
    const user = { uid: 'ada' } as User;
    const tokenFor = vi.fn(async () => ({ token: 'token', uid: 'ada' }));
    const { deps } = harness({ user, tokenFor });
    await exportWorkoutSheet(deps);
    expect(tokenFor).toHaveBeenCalledWith(user);
  });

  it('reports a cancelled Google sign-in without writing', async () => {
    const tokenFor = vi.fn(async () => {
      throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' });
    });
    const { deps, push } = harness({ user: null, tokenFor });
    const result = await exportWorkoutSheet(deps);
    expect(result).toEqual({ ok: false, message: 'Google sign-in was cancelled. The sheet was not updated.' });
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps a created file id when the later write fails', async () => {
    const push = vi.fn(async (opts: Parameters<typeof pushWorkoutSheet>[0]) => {
      await opts.onId?.(CREATED_ID);
      throw new SheetExportError('The Google Sheet was not updated. Try again.', 500);
    });
    const { deps, local } = harness({ push });
    const result = await exportWorkoutSheet(deps);
    expect(result).toEqual({ ok: false, message: 'The Google Sheet was not updated. Try again.' });
    expect(local.get('chris')).toBe(CREATED_ID);
  });

  it('still reports success when the sheet wrote but the account copy did not', async () => {
    const writeRemote = vi.fn(async () => { throw new Error('firestore'); });
    const { deps } = harness({ writeRemote });
    const result = await exportWorkoutSheet(deps);
    expect(result).toMatchObject({
      ok: true,
      synced: false,
      spreadsheetId: CREATED_ID,
    });
    if (result.ok) expect(result.message).toContain('saved on this device');
  });
});
