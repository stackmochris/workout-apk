import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { SHEETS_SCOPE, sheetsAuthAction } from '../engine/sheetExport';
import { auth } from './firebase';

const TOKEN_KEY = 'workout-apk:sheets-token';
/** Google access tokens last about an hour. Treat the last minute as already stale. */
const TOKEN_SKEW_MS = 60_000;
const DEFAULT_TTL_MS = 55 * 60 * 1000;

type CachedToken = { token: string; uid: string; expiresAt: number };

function sheetsProvider(user: User | null) {
  const provider = new GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  const params: Record<string, string> = {
    include_granted_scopes: 'true',
    // Consent mints a new access token that includes the Sheets scope.
    // select_account can hand back the sign-in token, which never had it.
    prompt: 'consent',
  };
  if (user?.email) params.login_hint = user.email;
  provider.setCustomParameters(params);
  return provider;
}

function browserStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** A token saved for this signed-in user that still has more than a minute left. */
export function readSheetsToken(storage: Storage, now: number, uid: string): { token: string; uid: string } | null {
  try {
    const raw = storage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedToken>;
    if (typeof parsed.token !== 'string' || parsed.token === '') return null;
    if (parsed.uid !== uid) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt - TOKEN_SKEW_MS <= now) return null;
    return { token: parsed.token, uid };
  } catch {
    return null;
  }
}

export function writeSheetsToken(storage: Storage, token: string, uid: string, expiresAt: number) {
  storage.setItem(TOKEN_KEY, JSON.stringify({ token, uid, expiresAt } satisfies CachedToken));
}

export function clearSheetsToken(storage: Storage) {
  storage.removeItem(TOKEN_KEY);
}

export function clearGoogleSheetsAccess() {
  const storage = browserStorage();
  if (!storage) return;
  try { clearSheetsToken(storage); } catch { /* the next export asks Google again */ }
}

/** Access token from a Firebase Google popup, including the field Firebase does not type. */
export function sheetsAccessTokenFrom(result: unknown): { token: string; expiresIn?: number } | null {
  let token = '';
  try {
    const credential = GoogleAuthProvider.credentialFromResult(result as UserCredential);
    if (credential?.accessToken) token = credential.accessToken;
  } catch {
    token = '';
  }
  const raw = result && typeof result === 'object' && '_tokenResponse' in result
    ? (result as { _tokenResponse?: { oauthAccessToken?: unknown; expiresIn?: unknown; oauthExpireIn?: unknown } })._tokenResponse
    : undefined;
  if (!token && typeof raw?.oauthAccessToken === 'string') token = raw.oauthAccessToken;
  if (!token) return null;
  const rawExpires = typeof raw?.expiresIn === 'number' ? raw.expiresIn : raw?.oauthExpireIn;
  const expiresIn = typeof rawExpires === 'number' ? rawExpires : typeof rawExpires === 'string' ? Number(rawExpires) : undefined;
  return { token, expiresIn: expiresIn != null && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined };
}

function authCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
}

async function googlePopup(user: User | null, provider: GoogleAuthProvider): Promise<UserCredential> {
  if (!auth) throw Object.assign(new Error('Sign-in is unavailable in this browser.'), { code: 'auth/unavailable' });
  const action = sheetsAuthAction(user ? user.providerData.map((p) => p.providerId) : null);
  try {
    if (action === 'reauthenticate' && user) return await reauthenticateWithPopup(user, provider);
    if (action === 'link' && user) return await linkWithPopup(user, provider);
    return await signInWithPopup(auth, provider);
  } catch (error) {
    // Email accounts that already linked Google still need a Sheets token.
    if (authCode(error) === 'auth/provider-already-linked' && user) return await reauthenticateWithPopup(user, provider);
    throw error;
  }
}

/**
 * Sheets access token for this export. A token from the last hour is reused.
 * After that, or when `force` is set, Google is asked again so an expired
 * token is not sent to Sheets. Email accounts are linked once, which puts the
 * file in that person's Drive without a second workout user.
 */
export async function googleSheetsAccessToken(user: User | null, opts?: { force?: boolean }): Promise<{ token: string; uid: string }> {
  const storage = browserStorage();
  if (!opts?.force && user && storage) {
    const cached = readSheetsToken(storage, Date.now(), user.uid);
    if (cached) return cached;
  }
  if (opts?.force && storage) clearSheetsToken(storage);
  const result = await googlePopup(user, sheetsProvider(user));
  const access = sheetsAccessTokenFrom(result);
  if (!access) throw Object.assign(new Error('Google did not grant Sheets access.'), { code: 'auth/no-sheets-token' });
  const uid = result.user.uid;
  if (storage) {
    try {
      writeSheetsToken(storage, access.token, uid, Date.now() + (access.expiresIn ? access.expiresIn * 1000 : DEFAULT_TTL_MS));
    } catch { /* this export still uses the token it just received */ }
  }
  return { token: access.token, uid };
}
