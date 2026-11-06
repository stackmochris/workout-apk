import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { SHEETS_SCOPE, sheetsAuthAction } from '../engine/sheetExport';
import { auth } from './firebase';

function sheetsProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  provider.setCustomParameters({ include_granted_scopes: 'true' });
  return provider;
}

/**
 * Fresh Sheets access token at export time. Nothing is stored: after a reload
 * the next export asks Google again. Email-only accounts are linked so the
 * file is created in their Google Drive without a second workout user.
 */
export async function googleSheetsAccessToken(user: User | null): Promise<{ token: string; uid: string }> {
  if (!auth) throw Object.assign(new Error('Sign-in is unavailable in this browser.'), { code: 'auth/unavailable' });
  const provider = sheetsProvider();
  const action = sheetsAuthAction(user ? user.providerData.map((p) => p.providerId) : null);
  const result = action === 'reauthenticate' && user
    ? await reauthenticateWithPopup(user, provider)
    : action === 'link' && user
      ? await linkWithPopup(user, provider)
      : await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw Object.assign(new Error('Google did not grant Sheets access.'), { code: 'auth/no-sheets-token' });
  return { token, uid: result.user.uid };
}
