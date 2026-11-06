import { describe, expect, it } from 'vitest';
import { forgetLocalSheetId, readLocalSheetId, resolveSheetId, writeLocalSheetId } from './sheetId';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

const ID = '1krFg3QzANKcy9p2dfA-HtVmnkefrFEUbbiF1O5p_I-w';

describe('sheet id storage', () => {
  it('keeps an id per person on the device and does not invent one', () => {
    const storage = memory();
    expect(readLocalSheetId('chris', storage)).toBeNull();
    expect(readLocalSheetId('evie', storage)).toBeNull();
    writeLocalSheetId('chris', `https://docs.google.com/spreadsheets/d/${ID}/edit`, storage);
    expect(readLocalSheetId('chris', storage)).toBe(ID);
    expect(readLocalSheetId('evie', storage)).toBeNull();
    writeLocalSheetId('chris', 'nope', storage);
    expect(readLocalSheetId('chris', storage)).toBe(ID);
    forgetLocalSheetId('chris', storage);
    expect(readLocalSheetId('chris', storage)).toBeNull();
  });

  it('uses the device id, and otherwise the account id', async () => {
    const storage = memory();
    const remote = new Map<string, string>([['ada', 'aaaaaaaaaaaaaaaaaaaa']]);
    const readRemote = (uid: string) => Promise.resolve(remote.get(uid) ?? null);
    expect(await resolveSheetId('ada', { storage, readRemote: () => readRemote('ada') })).toBe('aaaaaaaaaaaaaaaaaaaa');
    expect(readLocalSheetId('ada', storage)).toBe('aaaaaaaaaaaaaaaaaaaa');
    writeLocalSheetId('ada', ID, storage);
    remote.set('ada', 'bbbbbbbbbbbbbbbbbbbb');
    expect(await resolveSheetId('ada', { storage, readRemote: () => readRemote('ada') })).toBe(ID);
    expect(await resolveSheetId('nobody', { storage, readRemote: () => readRemote('nobody') })).toBeNull();
  });
});
