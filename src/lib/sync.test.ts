import { describe, expect, it } from 'vitest';
import { BodyEntry, Session } from '../types';
import {
  applyCatchUp,
  firestoreSafe,
  flushOps,
  lastSessionPayload,
  opKey,
  parseLastSession,
  queueBody,
  queueSession,
  reconcileQueue,
  syncDisplayName,
  type SyncOp,
  type SyncWriter,
} from './sync';

const session = (patch: Partial<Session> = {}): Session => ({
  id: 's1',
  date: '2026-11-01T08:00:00.000Z',
  focus: 'Chest',
  type: 'Normal',
  status: 'completed',
  movements: [
    {
      movementId: 'bench',
      name: 'Bench press',
      superset: 'a',
      notes: 'easy lockout',
      sets: [
        { reps: 8, weight: 80, done: true },
        { reps: 6, weight: 80, done: true },
        { reps: null, weight: null, done: false },
      ],
    },
    {
      movementId: 'row',
      name: 'Row',
      superset: 'a',
      sets: [{ reps: 10, weight: 60, done: true }],
    },
  ],
  durationMin: 42,
  notes: 'felt strong',
  author: 'app',
  updatedAt: '2026-11-01T09:00:00.000Z',
  ...patch,
});

const body = (patch: Partial<BodyEntry> = {}): BodyEntry => ({
  id: 'b1',
  date: '2026-11-02T07:00:00.000Z',
  weight: 82,
  energy: 7,
  elbow: 'ok',
  fasted: true,
  author: 'app',
  updatedAt: '2026-11-02T07:00:00.000Z',
  ...patch,
});

const writer = (fail: Set<string> = new Set()): SyncWriter & { calls: string[] } => {
  const calls: string[] = [];
  const run = async (op: SyncOp) => {
    const key = opKey(op);
    calls.push(key);
    if (fail.has(key)) throw new Error('offline');
  };
  return {
    calls,
    session: run,
    body: run,
    last: run,
  };
};

describe('sync payloads', () => {
  it('keeps the full session, including notes, duration, sets, and supersets', () => {
    const safe = firestoreSafe(session());
    expect(safe.focus).toBe('Chest');
    expect(safe.type).toBe('Normal');
    expect(safe.durationMin).toBe(42);
    expect(safe.notes).toBe('felt strong');
    expect(safe.movements[0].superset).toBe('a');
    expect(safe.movements[0].sets).toHaveLength(3);
    expect(safe.movements[0].notes).toBe('easy lockout');
  });

  it('drops undefined fields and keeps fasted body metrics when present', () => {
    const entry = firestoreSafe(body({ waist: undefined, bodyFat: 18 }));
    expect(entry.fasted).toBe(true);
    expect(entry.weight).toBe(82);
    expect(entry.energy).toBe(7);
    expect(entry.elbow).toBe('ok');
    expect(entry.bodyFat).toBe(18);
    expect('waist' in entry).toBe(false);
  });

  it('builds a compact last-session card', () => {
    const doc = lastSessionPayload(session(), 'Chris');
    expect(doc).toEqual({
      displayName: 'Chris',
      date: '2026-11-01T08:00:00.000Z',
      focus: 'Chest',
      type: 'Normal',
      durationMin: 42,
      movements: [
        { name: 'Bench press', sets: 2 },
        { name: 'Row', sets: 1 },
      ],
      notes: 'felt strong',
      updatedAt: '2026-11-01T09:00:00.000Z',
    });
    expect(lastSessionPayload(session({ notes: '  ', durationMin: undefined }), 'Chris').notes).toBeUndefined();
  });

  it('prefers the settings name, then the auth name, then email', () => {
    expect(syncDisplayName(' Chris ', 'Google Name', 'a@b.c')).toBe('Chris');
    expect(syncDisplayName('  ', 'Google Name', 'a@b.c')).toBe('Google Name');
    expect(syncDisplayName('', null, 'a@b.c')).toBe('a@b.c');
    expect(syncDisplayName('', null, '  ')).toBe('Someone');
  });
});

describe('sync queue', () => {
  it('replaces the same session id instead of duplicating it', () => {
    const first = queueSession([], 'u1', session(), 'Chris');
    const second = queueSession(first, 'u1', session({ notes: 'updated' }), 'Chris');
    const sessions = second.filter((op) => op.kind === 'session');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].kind === 'session' && sessions[0].session.notes).toBe('updated');
    expect(second.filter((op) => op.kind === 'last')).toHaveLength(1);
  });

  it('catch-up is idempotent and skips sessions that were not completed', () => {
    const skipped = session({ id: 'skip', status: 'skipped', date: '2026-11-03T08:00:00.000Z' });
    const older = session({ id: 'old', date: '2026-10-01T08:00:00.000Z' });
    const latest = session({ id: 'new', date: '2026-11-04T08:00:00.000Z', focus: 'Back' });
    const entries = [body(), body({ id: 'b2', waist: 84, fasted: false })];
    const once = applyCatchUp([], 'u1', [skipped, older, latest], entries, 'Chris');
    const twice = applyCatchUp(once, 'u1', [skipped, older, latest], entries, 'Chris');
    expect(twice.filter((op) => op.kind === 'session').map((op) => op.kind === 'session' && op.sessionId).sort()).toEqual(['new', 'old']);
    expect(twice.filter((op) => op.kind === 'body')).toHaveLength(2);
    const last = twice.find((op) => op.kind === 'last');
    expect(last && last.kind === 'last' && last.doc.focus).toBe('Back');
    expect(last && last.kind === 'last' && last.doc.displayName).toBe('Chris');
  });

  it('does not let an older session replace a newer queued last workout', () => {
    const queued = queueSession([], 'u1', session({ id: 'new', date: '2026-11-05T08:00:00.000Z' }), 'Chris');
    const next = queueSession(queued, 'u1', session({ id: 'old', date: '2026-11-01T08:00:00.000Z' }), 'Chris');
    const last = next.find((op) => op.kind === 'last');
    expect(last && last.kind === 'last' && last.sessionId).toBe('new');
  });

  it('keeps the queue while offline and drops only the revisions that were written', async () => {
    const queued = queueBody(queueSession([], 'u1', session(), 'Chris'), 'u1', body());
    const other = queueSession(queued, 'u2', session({ id: 'other' }), 'Sam');
    const offline = await flushOps(other, 'u1', false, writer());
    expect(reconcileQueue(other, offline)).toEqual(other);

    const failing = writer(new Set(['session:u1:s1']));
    const written = await flushOps(other, 'u1', true, failing);
    const left = reconcileQueue(other, written);
    expect(left.map(opKey).sort()).toEqual(['last:u2', 'session:u1:s1', 'session:u2:other']);
    expect(failing.calls).not.toContain('session:u2:other');

    const again = await flushOps(left, 'u1', true, writer());
    expect(reconcileQueue(left, again).map(opKey).sort()).toEqual(['last:u2', 'session:u2:other']);
  });

  it('stops the rest of the flush when the network times out', async () => {
    const queued = queueBody(queueSession([], 'u1', session(), 'Chris'), 'u1', body());
    const slow = writer();
    slow.session = async () => { throw new Error('timeout'); };
    const written = await flushOps(queued, 'u1', true, slow);
    expect(written.size).toBe(0);
    expect(reconcileQueue(queued, written)).toHaveLength(queued.length);
  });

  it('keeps a newer revision when the flushed copy is stale', () => {
    const queued = queueSession([], 'u1', session(), 'Chris');
    const sessionOp = queued.find((op) => op.kind === 'session')!;
    const written = new Map([[opKey(sessionOp), sessionOp.rev]]);
    const newer = queueSession(queued, 'u1', session({ notes: 'after' }), 'Chris');
    const left = reconcileQueue(newer, written);
    expect(left.some((op) => op.kind === 'session' && op.session.notes === 'after')).toBe(true);
  });
});

describe('parseLastSession', () => {
  it('reads a last-session card and ignores junk rows', () => {
    const view = parseLastSession('u1', lastSessionPayload(session(), 'Chris'));
    expect(view?.uid).toBe('u1');
    expect(view?.movements).toEqual([
      { name: 'Bench press', sets: 2 },
      { name: 'Row', sets: 1 },
    ]);
    expect(parseLastSession('u2', { focus: 'Arm' })).toBeNull();
    expect(parseLastSession('u3', null)).toBeNull();
  });
});
