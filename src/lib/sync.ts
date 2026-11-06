import { BodyEntry, LoggedMovement, Session } from '../types';

/** Compact last-workout card stored at lastSessions/{uid}. */
export interface LastSessionDoc {
  displayName: string;
  date: string;
  focus: string;
  type: string;
  durationMin?: number;
  movements: { name: string; sets: number }[];
  notes?: string;
  updatedAt: string;
}

export interface LastSessionView extends LastSessionDoc {
  uid: string;
}

export type SessionOp = { kind: 'session'; rev: number; uid: string; sessionId: string; session: Session };
export type BodyOp = { kind: 'body'; rev: number; uid: string; entryId: string; entry: BodyEntry };
export type LastOp = { kind: 'last'; rev: number; uid: string; sessionId: string; date: string; doc: LastSessionDoc };
export type SyncOp = SessionOp | BodyOp | LastOp;
export type NewSyncOp =
  | Omit<SessionOp, 'rev'>
  | Omit<BodyOp, 'rev'>
  | Omit<LastOp, 'rev'>;

export type SyncWriter = {
  session: (op: SessionOp) => Promise<void>;
  body: (op: BodyOp) => Promise<void>;
  last: (op: LastOp) => Promise<void>;
};

export function syncDisplayName(settingsName?: string | null, authName?: string | null, email?: string | null): string {
  const local = settingsName?.trim();
  if (local) return local;
  const fromAuth = authName?.trim();
  if (fromAuth) return fromAuth;
  const mail = email?.trim();
  if (mail) return mail;
  return 'Someone';
}

/** Drop undefined so Firestore accepts the payload. */
export function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function setCount(movement: LoggedMovement): number {
  const done = movement.sets.filter((s) => s.done).length;
  if (done > 0) return done;
  return movement.sets.filter((s) => s.reps != null || s.weight != null || s.dropStart != null || s.dropEnd != null).length;
}

export function lastSessionPayload(session: Session, displayName: string): LastSessionDoc {
  const doc: LastSessionDoc = {
    displayName,
    date: session.date,
    focus: session.focus,
    type: session.type,
    movements: session.movements.map((m) => ({ name: m.name, sets: setCount(m) })),
    updatedAt: session.updatedAt,
  };
  if (session.durationMin != null) doc.durationMin = session.durationMin;
  const notes = session.notes?.trim();
  if (notes) doc.notes = notes;
  return doc;
}

export function planCatchUp(sessions: Session[], body: BodyEntry[]): { sessions: Session[]; body: BodyEntry[]; last: Session | null } {
  const completed = sessions.filter((s) => s.status === 'completed' && s.id);
  let last: Session | null = null;
  for (const session of completed) {
    if (!last || session.date > last.date) last = session;
  }
  return { sessions: completed, body: body.filter((entry) => entry.id), last };
}

export function opKey(op: Pick<SyncOp, 'kind' | 'uid'> & { sessionId?: string; entryId?: string }): string {
  if (op.kind === 'session') return `session:${op.uid}:${op.sessionId}`;
  if (op.kind === 'body') return `body:${op.uid}:${op.entryId}`;
  return `last:${op.uid}`;
}

export function upsertOp(queue: SyncOp[], op: NewSyncOp): SyncOp[] {
  const rev = queue.reduce((max, item) => Math.max(max, item.rev), 0) + 1;
  const next = { ...op, rev } as SyncOp;
  const key = opKey(next);
  return [...queue.filter((item) => opKey(item) !== key), next];
}

export function upsertLastIfNewer(queue: SyncOp[], uid: string, session: Session, displayName: string): SyncOp[] {
  const existing = queue.find((op): op is LastOp => op.kind === 'last' && op.uid === uid);
  if (existing && existing.date > session.date) return queue;
  return upsertOp(queue, {
    kind: 'last',
    uid,
    sessionId: session.id,
    date: session.date,
    doc: lastSessionPayload(session, displayName),
  });
}

export function queueSession(queue: SyncOp[], uid: string, session: Session, displayName: string): SyncOp[] {
  if (session.status !== 'completed' || !session.id) return queue;
  const withSession = upsertOp(queue, {
    kind: 'session',
    uid,
    sessionId: session.id,
    session: firestoreSafe(session),
  });
  return upsertLastIfNewer(withSession, uid, session, displayName);
}

export function queueBody(queue: SyncOp[], uid: string, entry: BodyEntry): SyncOp[] {
  if (!entry.id) return queue;
  return upsertOp(queue, { kind: 'body', uid, entryId: entry.id, entry: firestoreSafe(entry) });
}

export function applyCatchUp(queue: SyncOp[], uid: string, sessions: Session[], body: BodyEntry[], displayName: string): SyncOp[] {
  const plan = planCatchUp(sessions, body);
  let next = queue;
  for (const session of plan.sessions) next = queueSession(next, uid, session, displayName);
  for (const entry of plan.body) next = queueBody(next, uid, entry);
  return next;
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof Error && error.message === 'timeout') return true;
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
  return code === 'unavailable' || code === 'deadline-exceeded' || code === 'cancelled' || code === 'auth/network-request-failed';
}

export async function flushOps(ops: SyncOp[], uid: string, online: boolean, write: SyncWriter): Promise<Map<string, number>> {
  const written = new Map<string, number>();
  if (!online) return written;
  for (const op of ops) {
    if (op.uid !== uid) continue;
    try {
      if (op.kind === 'session') await write.session(op);
      else if (op.kind === 'body') await write.body(op);
      else await write.last(op);
      written.set(opKey(op), op.rev);
    } catch (error) {
      // A dead network should not time out once per queued record.
      if (isRetryableNetworkError(error)) return written;
    }
  }
  return written;
}

/** Drop ops whose queued revision was written. A newer revision of the same id stays. */
export function reconcileQueue(latest: SyncOp[], written: Map<string, number>): SyncOp[] {
  return latest.filter((op) => written.get(opKey(op)) !== op.rev);
}

export function parseLastSession(uid: string, raw: unknown): LastSessionView | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.date !== 'string' || typeof data.focus !== 'string') return null;
  const movements = Array.isArray(data.movements)
    ? data.movements.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        if (typeof row.name !== 'string' || !row.name) return [];
        const sets = typeof row.sets === 'number' && Number.isFinite(row.sets) ? row.sets : 0;
        return [{ name: row.name, sets }];
      })
    : [];
  const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
  const view: LastSessionView = {
    uid,
    displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : 'Someone',
    date: data.date,
    focus: data.focus,
    type: typeof data.type === 'string' ? data.type : '',
    movements,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : data.date,
  };
  if (typeof data.durationMin === 'number') view.durationMin = data.durationMin;
  if (notes) view.notes = notes;
  return view;
}
