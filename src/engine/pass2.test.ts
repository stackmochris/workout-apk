import { describe, expect, it } from 'vitest';
import { parseKg, isPartialKg, parseReps } from '../lib/kg';
import { editSet } from './sets';
import { blocks, logBlock, blockLabel } from './gvt';
import { foldHistory, insights, e1rm } from './history';
import { LoggedMovement, Session } from '../types';

describe('parseKg', () => {
  it('accepts up to 2 decimals with dot or comma', () => {
    expect(parseKg('1.25')).toBe(1.25);
    expect(parseKg('12,5')).toBe(12.5);
    expect(parseKg('14.9')).toBe(14.9);
    expect(parseKg('100')).toBe(100);
    expect(parseKg('')).toBeNull();
  });
  it('rejects bad input', () => {
    expect(parseKg('1.255')).toBeUndefined();
    expect(parseKg('abc')).toBeUndefined();
    expect(parseKg('-5')).toBeUndefined();
    expect(parseKg('1.2.3')).toBeUndefined();
  });
  it('treats a trailing separator as partial', () => {
    expect(isPartialKg('12.')).toBe(true);
    expect(isPartialKg('12,')).toBe(true);
    expect(isPartialKg('12.345')).toBe(false);
  });
  it('reps are whole numbers', () => {
    expect(parseReps('8')).toBe(8);
    expect(parseReps('8.5')).toBeUndefined();
  });
});

describe('auto-tick', () => {
  const blank = { reps: null, weight: null, done: false };
  it('ticks once reps is entered', () => {
    expect(editSet(blank, { weight: 50 }).done).toBe(false);
    expect(editSet(editSet(blank, { weight: 50 }), { reps: 8 })).toEqual({ weight: 50, reps: 8, done: true });
  });
  it('unticks when reps is cleared', () => {
    expect(editSet({ weight: 50, reps: 8, done: true }, { reps: null }).done).toBe(false);
  });
  it('reps of 0 still counts as entered', () => {
    expect(editSet(blank, { reps: 0 }).done).toBe(true);
  });
});

describe('GVT weight blocks', () => {
  it('records 5 @ 50 then 5 @ 40 as two blocks', () => {
    let lm: LoggedMovement = { movementId: 'bench', name: 'Bench', sets: [{ reps: null, weight: null, done: false }] };
    lm = logBlock(lm, 50, [10, 10, 10, 10, 10]);
    lm = logBlock(lm, 40, [10, 10, 10, 10, 8]);
    expect(lm.sets).toHaveLength(10);
    const b = blocks(lm.sets);
    expect(b).toEqual([
      { weight: 50, sets: 5, reps: [10, 10, 10, 10, 10] },
      { weight: 40, sets: 5, reps: [10, 10, 10, 10, 8] },
    ]);
    expect(b.map(blockLabel)).toEqual(['5×10 @ 50 kg', '5×10/10/10/10/8 @ 40 kg']);
  });
  it('an adjust with no completed sets logs nothing', () => {
    const lm = logBlock({ movementId: 'x', name: 'x', sets: [] }, 50, []);
    expect(lm.sets).toHaveLength(0);
  });
});

const sess = (date: string, kg: number, reps = 5, extra: Partial<Session> = {}): Session => ({
  id: date + kg, date: new Date(date).toISOString(), focus: 'Chest', type: 'Normal', status: 'completed',
  movements: [{ movementId: 'bench', name: 'Bench', sets: [{ weight: kg, reps, done: true }] }],
  author: 'app', updatedAt: date, ...extra,
});

describe('foldHistory', () => {
  const now = new Date(2026, 9, 22, 12); // Thu 22 Oct 2026
  it('keeps this week as day cards and folds finished weeks', () => {
    const g = foldHistory([sess('2026-10-20T10:00', 50), sess('2026-10-21T10:00', 52), sess('2026-10-14T10:00', 48)], now);
    expect(g.map((x) => x.kind)).toEqual(['day', 'day', 'week']);
    expect(g[2].kind === 'week' && g[2].label).toBe('Week (12 Oct – 18 Oct)');
  });
  it('folds a month with 4 finished weeks', () => {
    const s = ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((d, i) => sess(d + 'T10:00', 40 + i));
    const g = foldHistory(s, now);
    expect(g.map((x) => x.kind)).toEqual(['week', 'month']);
    const m = g[1];
    expect(m.kind === 'month' && m.label).toBe('Month (Sep 2026)');
    expect(m.kind === 'month' && m.weeks.length).toBe(4);
  });
  it('a month with under 4 finished weeks stays as weeks', () => {
    const g = foldHistory([sess('2026-10-06T10:00', 50), sess('2026-10-13T10:00', 50)], now);
    expect(g.map((x) => x.kind)).toEqual(['week', 'week']);
  });
});

describe('insights', () => {
  it('computes PRs, drops, sessions and volume from logged data only', () => {
    const all = [
      sess('2026-10-06T10:00', 50, 5),
      { ...sess('2026-10-07T10:00', 30, 10), movements: [{ movementId: 'row', name: 'Row', sets: [{ weight: 30, reps: 10, done: true }] }] },
      sess('2026-10-13T10:00', 55, 5),
      { ...sess('2026-10-14T10:00', 25, 10), movements: [{ movementId: 'row', name: 'Row', sets: [{ weight: 25, reps: 10, done: true }] }] },
      sess('2026-10-15T10:00', 0, 0, { status: 'skipped', movements: [] }),
    ];
    const i = insights(all, new Date(2026, 9, 12), new Date(2026, 9, 19), 1, 4);
    expect(i.completed).toBe(2);
    expect(i.planned).toBe(4);
    expect(i.volumeKg).toBe(55 * 5 + 25 * 10);
    expect(i.prevVolumeKg).toBe(50 * 5 + 30 * 10);
    expect(i.prs).toEqual([
      { name: 'Bench', kind: 'kg', value: 55, previous: 50 },
      { name: 'Bench', kind: 'e1rm', value: e1rm(55, 5), previous: e1rm(50, 5) },
    ]);
    expect(i.drops).toEqual([{ name: 'Row', kg: 25, previous: 30 }]);
  });
  it('first-ever lifts are not PRs', () => {
    expect(insights([sess('2026-10-13T10:00', 55)], new Date(2026, 9, 12), new Date(2026, 9, 19), 1, 4).prs).toEqual([]);
  });
});
