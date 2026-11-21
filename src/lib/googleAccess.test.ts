import { describe, expect, it, vi } from 'vitest';
import { readSheetsToken, sheetsAccessTokenFrom, writeSheetsToken } from './googleAccess';

vi.mock('./firebase', () => ({
  auth: null,
  db: null,
  firebaseApp: null,
}));

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

describe('sheets token cache', () => {
  const now = Date.parse('2026-11-21T08:00:00.000Z');

  it('reuses a token inside the hour and drops it once it is about to expire', () => {
    const storage = memory();
    expect(readSheetsToken(storage, now, 'chris')).toBeNull();
    writeSheetsToken(storage, 'ya29.fresh', 'chris', now + 10 * 60 * 1000);
    expect(readSheetsToken(storage, now, 'chris')).toEqual({ token: 'ya29.fresh', uid: 'chris' });
    expect(readSheetsToken(storage, now, 'ada')).toBeNull();
    writeSheetsToken(storage, 'ya29.stale', 'chris', now + 30 * 1000);
    expect(readSheetsToken(storage, now, 'chris')).toBeNull();
  });

  it('reads the access token Firebase returns beside the typed credential', () => {
    expect(sheetsAccessTokenFrom({
      user: { uid: 'chris' },
      _tokenResponse: { oauthAccessToken: 'ya29.popup', oauthExpireIn: '3600' },
    })).toEqual({ token: 'ya29.popup', expiresIn: 3600 });
    expect(sheetsAccessTokenFrom({ user: { uid: 'chris' } })).toBeNull();
  });
});
