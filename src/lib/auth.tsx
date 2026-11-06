import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  busy: boolean;
  error: string;
  signInGoogle: () => Promise<boolean>;
  signInEmail: (email: string, password: string) => Promise<boolean>;
  signUpEmail: (email: string, password: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function friendly(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
  const message = error instanceof Error ? error.message : '';
  switch (code) {
    case 'app/validation': return message || 'Check the email and password.';
    case 'auth/invalid-email': return 'That email does not look right.';
    case 'auth/missing-password':
    case 'auth/weak-password': return 'Use a password of at least 6 characters.';
    case 'auth/email-already-in-use': return 'An account with that email already exists. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email or password did not match.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Google sign-in was cancelled.';
    case 'auth/unauthorized-domain': return 'This site is not allowed to use Google sign-in yet.';
    case 'auth/network-request-failed': return 'You appear to be offline. Try again when you are back online.';
    case 'auth/unavailable': return 'Sign-in is unavailable in this browser.';
    default: return 'Sign-in did not complete. Try again.';
  }
}

function validate(email: string, password: string) {
  if (!email.includes('@')) throw Object.assign(new Error('That email does not look right.'), { code: 'app/validation' });
  if (password.length < 6) throw Object.assign(new Error('Use a password of at least 6 characters.'), { code: 'app/validation' });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!auth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) return;
    let active = true;
    void setPersistence(auth, browserLocalPersistence).catch(() => {});
    void getRedirectResult(auth).catch((reason) => {
      if (active) setError(friendly(reason));
    });
    const unsub = onAuthStateChanged(auth, (next) => {
      if (!active) return;
      setUser(next);
      setReady(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (reason) {
      setError(friendly(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    ready,
    busy,
    error,
    signInGoogle: () => run(async () => {
      if (!auth) throw Object.assign(new Error('unavailable'), { code: 'auth/unavailable' });
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (reason) {
        const code = typeof reason === 'object' && reason && 'code' in reason ? String((reason as { code: string }).code) : '';
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw reason;
      }
    }),
    signInEmail: (email, password) => run(async () => {
      validate(email.trim(), password);
      if (!auth) throw Object.assign(new Error('unavailable'), { code: 'auth/unavailable' });
      await signInWithEmailAndPassword(auth, email.trim(), password);
    }),
    signUpEmail: (email, password) => run(async () => {
      validate(email.trim(), password);
      if (!auth) throw Object.assign(new Error('unavailable'), { code: 'auth/unavailable' });
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    }),
    signOutUser: async () => {
      setError('');
      if (!auth) return;
      await signOut(auth);
    },
  }), [user, ready, busy, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
