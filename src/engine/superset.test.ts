import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { computeSessionStats } from './sessionStats';
import {
  addLibraryMovement,
  mergeMovement,
  moveBlock,
  movementsToRecord,
  setMark,
  unlinkAll,
  unlinkMovement,
} from './superset';
import { LoggedMovement, Session, SetEntry } from '../types';

const set = (weight: number | null, reps: number | null, done = false, kind?: SetEntry['kind']): SetEntry =>
  ({ weight, reps, done, kind });

function mv(partial: Partial<LoggedMovement> & Pick<LoggedMovement, 'movementId' | 'name'>): LoggedMovement {
  return { sets: [set(null, null)], ...partial };
}

const bench = () => mv({
  movementId: 'bench',
  name: 'Bench press',
  notes: 'pause',
  sets: [set(80, 5, true), set(80, 5)],
});
const curl = () => mv({
  movementId: 'curl',
  name: 'Curl',
  notes: 'elbow ok',
  performedAt: '2026-11-04T10:00:00.000Z',
  sets: [set(14, 12, true)],
});
const row = () => mv({ movementId: 'row', name: 'Row', sets: [set(60, 8, true)] });
const fly = () => mv({ movementId: 'fly', name: 'Fly', sets: [set(16, 12, true)] });

describe('superset merge', () => {
  it('folds an existing card into the anchor and keeps its logged sets', () => {
    const anchor = bench();
    const partner = curl();
    const result = mergeMovement([anchor, row(), partner], 0, 2, 'g1');
    expect(result.anchorIndex).toBe(0);
    expect(result.movements.map((m) => m.name)).toEqual(['Bench press', 'Curl', 'Row']);
    expect(result.movements[0].superset).toBe('g1');
    expect(result.movements[1].superset).toBe('g1');
    expect(result.movements[2].superset).toBeUndefined();
    expect(result.movements[1].sets).toEqual([set(14, 12, true)]);
    expect(result.movements[1].notes).toBe('elbow ok');
    expect(result.movements[1].performedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(result.movements[0].sets).toEqual(anchor.sets);
    expect(result.movements[0].notes).toBe('pause');
    expect(partner.sets[0].weight).toBe(14);
  });

  it('keeps the tapped card in place when the partner was listed above it', () => {
    const result = mergeMovement([curl(), row(), bench()], 2, 0, 'g1');
    expect(result.movements.map((m) => m.name)).toEqual(['Row', 'Bench press', 'Curl']);
    expect(result.anchorIndex).toBe(1);
    expect(result.movements[1].superset).toBe(result.movements[2].superset);
    expect(result.movements[2].sets[0]).toMatchObject({ weight: 14, reps: 12, done: true });
  });

  it('pulls one movement out of another superset and clears a leftover single', () => {
    const a = { ...bench(), superset: 'ga' };
    const b = { ...fly(), superset: 'ga' };
    const c = { ...curl(), superset: 'gb' };
    const d = { ...row(), superset: 'gb' };
    const result = mergeMovement([a, b, c, d], 0, 2, 'new');
    expect(result.movements.map((m) => m.movementId)).toEqual(['bench', 'fly', 'curl', 'row']);
    expect(result.movements.slice(0, 3).map((m) => m.superset)).toEqual(['ga', 'ga', 'ga']);
    expect(result.movements[3].superset).toBeUndefined();
    expect(result.movements[2].sets[0].weight).toBe(14);
  });

  it('adds a library movement onto the card, and merges when that lift is already in the workout', () => {
    const added = addLibraryMovement([bench(), row()], 0, fly(), 'g1');
    expect(added.movements.map((m) => m.movementId)).toEqual(['bench', 'fly', 'row']);
    expect(added.movements[0].superset).toBe(added.movements[1].superset);
    expect(added.anchorIndex).toBe(0);

    const again = addLibraryMovement(added.movements, added.anchorIndex, { ...curl(), movementId: 'row', name: 'Row' }, 'g2');
    expect(again.movements.map((m) => m.movementId)).toEqual(['bench', 'fly', 'row']);
    const moved = again.movements.find((m) => m.movementId === 'row')!;
    expect(moved.sets[0]).toMatchObject({ weight: 60, reps: 8, done: true });
    expect(moved.superset).toBe(again.movements[0].superset);
    expect(again.movements.filter((m) => !m.superset)).toHaveLength(0);
  });

  it('labels alternating sets A1, B1, A2', () => {
    expect(setMark(0, 0)).toBe('A1');
    expect(setMark(1, 0)).toBe('B1');
    expect(setMark(0, 1)).toBe('A2');
    expect(setMark(2, 3)).toBe('C4');
  });
});

describe('superset unlink', () => {
  it('returns a partner to its own card and clears the group when one remains', () => {
    const linked = mergeMovement([bench(), curl()], 0, 1, 'g1').movements;
    const undone = unlinkMovement(linked, 1);
    expect(undone).toHaveLength(2);
    expect(undone.every((m) => m.superset === undefined)).toBe(true);
    expect(undone[1].sets).toEqual([set(14, 12, true)]);
    expect(undone[0].sets[0].weight).toBe(80);
  });

  it('unlinks one movement from a triple and leaves the other two paired', () => {
    let list = mergeMovement([bench(), curl()], 0, 1, 'g1').movements;
    list = addLibraryMovement(list, 0, fly(), 'g1').movements;
    expect(list.filter((m) => m.superset).length).toBe(3);
    const undone = unlinkMovement(list, 1);
    const still = undone.filter((m) => m.superset);
    const free = undone.filter((m) => !m.superset);
    expect(still).toHaveLength(2);
    expect(new Set(still.map((m) => m.superset)).size).toBe(1);
    expect(free.map((m) => m.movementId)).toEqual(['curl']);
    expect(free[0].sets[0].weight).toBe(14);
  });

  it('unlink all breaks the whole card without dropping sets', () => {
    const linked = mergeMovement([bench(), curl(), row()], 0, 1, 'g1').movements;
    const undone = unlinkAll(linked, 0);
    expect(undone.map((m) => m.superset)).toEqual([undefined, undefined, undefined]);
    expect(undone[0].sets[0].weight).toBe(80);
    expect(undone[1].sets[0].weight).toBe(14);
  });

  it('moves a superset card as one block', () => {
    const linked = mergeMovement([row(), bench(), curl()], 1, 2, 'g1').movements;
    expect(linked.map((m) => m.movementId)).toEqual(['row', 'bench', 'curl']);
    const up = moveBlock(linked, 1, -1);
    expect(up.map((m) => m.movementId)).toEqual(['bench', 'curl', 'row']);
    expect(up[0].superset).toBe(up[1].superset);
    expect(up[2].superset).toBeUndefined();
  });
});

describe('superset persistence', () => {
  const session = (movements: LoggedMovement[], date = '2026-11-04T12:00:00.000Z'): Session => ({
    id: date,
    date,
    focus: 'Arm',
    type: 'Normal',
    status: 'completed',
    movements,
    author: 'app',
    updatedAt: date,
  });

  it('saves both movements and reloads the same group, sets and ids', () => {
    const merged = mergeMovement([bench(), mv({ movementId: 'row', name: 'Row', sets: [set(null, null)] }), curl()], 0, 2, 'g1').movements;
    const recorded = movementsToRecord(merged);
    expect(recorded.map((m) => m.movementId)).toEqual(['bench', 'curl']);
    const finished = movementsToRecord(merged.map((m) => ({ ...m, finished: true })));
    expect(finished.map((m) => m.movementId)).toEqual(['bench', 'curl', 'row']);
    expect(finished[0].superset).toBe(finished[1].superset);
    expect(finished[2].superset).toBeUndefined();
    expect(recorded[0].superset).toBe(recorded[1].superset);
    expect(recorded[0].sets.filter((s) => s.done)).toHaveLength(1);
    expect(recorded[1].sets[0]).toMatchObject({ weight: 14, reps: 12, done: true });

    const raw = {
      version: 2,
      draft: { focus: 'Arm', type: 'Normal', movements: merged },
      sessions: [session(recorded)],
    };
    const loaded = migrate(JSON.parse(JSON.stringify(raw)));
    expect(loaded.draft!.movements.map((m) => m.movementId)).toEqual(['bench', 'curl', 'row']);
    expect(loaded.draft!.movements[0].superset).toBe('g1');
    expect(loaded.draft!.movements[1].superset).toBe('g1');
    expect(loaded.draft!.movements[2].superset).toBeUndefined();
    expect(loaded.draft!.movements[0].notes).toBe('pause');
    expect(loaded.draft!.movements[1].sets[0]).toMatchObject({ weight: 14, reps: 12, done: true });
    expect(loaded.sessions[0].movements).toHaveLength(2);
    expect(loaded.sessions[0].movements[0].superset).toBe(loaded.sessions[0].movements[1].superset);
    expect(loaded.sessions[0].movements.map((m) => m.movementId)).toEqual(['bench', 'curl']);

    const stats = computeSessionStats(loaded.sessions[0], [
      session([
        mv({ movementId: 'bench', name: 'Bench press', sets: [set(70, 5, true)] }),
        mv({ movementId: 'curl', name: 'Curl', sets: [set(16, 12, true)] }),
      ], '2026-11-01T12:00:00.000Z'),
    ]);
    expect(stats.prs.map((p) => p.movement)).toEqual(['Bench press']);
    expect(stats.prs[0]).toMatchObject({ weight: 80, reps: 5 });
    expect(stats.totalVolume).toBe(80 * 5 + 14 * 12);
  });

  it('reloads an unlinked workout as separate movements', () => {
    const linked = mergeMovement([bench(), curl()], 0, 1, 'g1').movements;
    const undone = unlinkMovement(linked, 1);
    const loaded = migrate({
      version: 2,
      draft: { focus: 'Arm', type: 'Normal', movements: undone },
      sessions: [],
    });
    expect(loaded.draft!.movements.every((m) => m.superset === undefined)).toBe(true);
    expect(loaded.draft!.movements[1].sets[0].weight).toBe(14);
  });

  it('keeps a saved superset and clears a group of one', () => {
    const kept = migrate({
      version: 2,
      sessions: [session([
        { ...bench(), superset: 'g1' },
        { ...curl(), superset: 'g1' },
      ])],
      draft: {
        focus: 'Chest',
        type: 'Normal',
        movements: [
          { ...bench(), superset: 'old' },
          { ...row(), superset: undefined },
          { ...curl(), superset: 'old' },
          mv({ movementId: 'solo', name: 'Solo', superset: 'lonely', sets: [set(20, 10, true)] }),
        ],
      },
    });
    expect(kept.sessions[0].movements.map((m) => m.superset)).toEqual(['g1', 'g1']);
    expect(kept.sessions[0].movements[1].sets[0].weight).toBe(14);
    expect(kept.draft!.movements.map((m) => m.movementId)).toEqual(['bench', 'curl', 'row', 'solo']);
    expect(kept.draft!.movements.map((m) => m.superset)).toEqual(['old', 'old', undefined, undefined]);
    expect(kept.draft!.movements[3].sets[0].weight).toBe(20);
  });
});
