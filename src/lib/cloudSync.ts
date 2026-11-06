import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { BodyEntry, Session } from '../types';
import { auth, db } from './firebase';
import {
  applyCatchUp,
  flushOps,
  queueBody,
  queueSession,
  reconcileQueue,
  type SyncOp,
  type SyncWriter,
} from './sync';

const QUEUE_KEY = 'workout-apk:sync-queue';

function isSyncOp(value: unknown): value is SyncOp {
  if (!value || typeof value !== 'object') return false;
  const op = value as SyncOp;
  if (typeof op.uid !== 'string' || typeof op.rev !== 'number') return false;
  if (op.kind === 'session') return typeof op.sessionId === 'string' && !!op.session;
  if (op.kind === 'body') return typeof op.entryId === 'string' && !!op.entry;
  if (op.kind === 'last') return typeof op.sessionId === 'string' && typeof op.date === 'string' && !!op.doc;
  return false;
}

function loadQueue(): SyncOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSyncOp) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: SyncOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

const listeners = new Set<() => void>();

export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function pendingFor(uid: string | null | undefined): number {
  if (!uid) return 0;
  return loadQueue().filter((op) => op.uid === uid).length;
}

function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

const writer: SyncWriter = {
  async session(op) {
    if (!db) throw new Error('Firestore is unavailable');
    await withTimeout(setDoc(doc(db, 'users', op.uid, 'sessions', op.sessionId), op.session, { merge: true }));
  },
  async body(op) {
    if (!db) throw new Error('Firestore is unavailable');
    await withTimeout(setDoc(doc(db, 'users', op.uid, 'body', op.entryId), op.entry, { merge: true }));
  },
  async last(op) {
    if (!db) throw new Error('Firestore is unavailable');
    const ref = doc(db, 'lastSessions', op.uid);
    await withTimeout(runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists() ? String((snap.data() as { date?: string }).date ?? '') : '';
      if (prev > op.doc.date) return;
      tx.set(ref, op.doc, { merge: true });
    }));
  },
};

let chain: Promise<void> = Promise.resolve();

function online() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

async function runFlush() {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  const written = await flushOps(loadQueue(), uid, online(), writer);
  saveQueue(reconcileQueue(loadQueue(), written));
  emit();
}

function kick() {
  chain = chain.then(runFlush).catch(() => {});
}

function enqueue(next: SyncOp[]) {
  saveQueue(next);
  emit();
  kick();
}

export function syncSession(session: Session, displayName: string) {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  try {
    enqueue(queueSession(loadQueue(), uid, session, displayName));
  } catch {
    // The workout is already stored on the device.
  }
}

export function syncBody(entry: BodyEntry) {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  try {
    enqueue(queueBody(loadQueue(), uid, entry));
  } catch {
    // The body entry is already stored on the device.
  }
}

export function catchUp(uid: string, sessions: Session[], body: BodyEntry[], displayName: string) {
  try {
    enqueue(applyCatchUp(loadQueue(), uid, sessions, body, displayName));
  } catch {
    // Local data remains the source of truth.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => kick());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
}

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) kick();
  });
}
