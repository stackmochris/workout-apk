import { describe, expect, it } from 'vitest';
import { DEFAULT_PENALTY, penalisedHint, penaltyState, previousWeekCount, weekCount, weekStart } from './week';
import { Session } from '../types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const s = (date: Date, extra: Partial<Session> = {}): Session => ({
  id: Math.random().toString(36), date: date.toISOString(), focus: 'Chest', type: 'Normal', status: 'completed',
  movements: [], author: 'app', updatedAt: date.toISOString(), ...extra,
});
// Wed 21 Oct 2026. This week starts Mon 19 Oct; last week is 12–18 Oct.
const NOW = at(2026, 10, 21, 21);

describe('weekStart', () => {
  it('is Monday 00:00 local', () => {
    const w = weekStart(NOW);
    expect([w.getDay(), w.getDate(), w.getHours()]).toEqual([1, 19, 0]);
  });
  it('treats Sunday as the end of the week', () => {
    expect(weekStart(at(2026, 10, 25, 23)).getDate()).toBe(19);
    expect(weekStart(at(2026, 10, 26, 0)).getDate()).toBe(26);
  });
});

describe('week counts', () => {
  const sessions = [
    s(at(2026, 10, 11, 23)), // Sunday before last week
    s(at(2026, 10, 12, 0)), // Monday 00:00 last week
    s(at(2026, 10, 14), { swap: true }),
    s(at(2026, 10, 16), { status: 'skipped' }),
    s(at(2026, 10, 18, 23)),
    s(at(2026, 10, 19, 0)), // this week
  ];
  it('counts completed sessions including swaps, excluding skips', () => {
    expect(previousWeekCount(sessions, NOW)).toBe(3);
    expect(weekCount(sessions, NOW)).toBe(1);
  });
});

describe('penaltyState', () => {
  it('is off with no history', () => {
    expect(penaltyState([], NOW).multiplier).toBe(0);
  });
  it('is off when last week hit 4 (swaps count)', () => {
    const ss = [12, 13, 14, 15].map((d, i) => s(at(2026, 10, d), { swap: i === 0 }));
    expect(penaltyState(ss, NOW)).toMatchObject({ multiplier: 0, lastWeekCount: 4 });
  });
  it('applies when last week had fewer than 4', () => {
    const ss = [12, 13, 14].map((d) => s(at(2026, 10, d)));
    expect(penaltyState(ss, NOW)).toMatchObject({ multiplier: 1, missedWeeks: 1, lastWeekCount: 3 });
  });
  it('applies when last week had none but tracking started earlier', () => {
    expect(penaltyState([s(at(2026, 10, 6))], NOW).multiplier).toBe(1);
  });
  it('does not penalise weeks before the first session', () => {
    expect(penaltyState([s(at(2026, 10, 20))], NOW).multiplier).toBe(0);
  });
  it('does not stack by default', () => {
    const ss = [s(at(2026, 9, 28)), s(at(2026, 10, 6)), s(at(2026, 10, 13))];
    expect(penaltyState(ss, NOW, 4, false).multiplier).toBe(1);
  });
  it('stacks consecutive missed weeks when enabled', () => {
    const full = [21, 22, 23, 24].map((d) => s(at(2026, 9, d)));
    const ss = [...full, s(at(2026, 10, 6)), s(at(2026, 10, 13))];
    // missed: 28 Sep (0), 5 Oct (1), 12 Oct (1); 21 Sep week was full.
    expect(penaltyState(ss, NOW, 4, true)).toMatchObject({ multiplier: 3, missedWeeks: 3 });
  });
  it('stacking stops at the first session week', () => {
    expect(penaltyState([s(at(2026, 10, 6))], NOW, 4, true).multiplier).toBe(2);
  });
});

describe('penalisedHint', () => {
  const prev = { weight: 60, reps: 8 };
  it('adds barbell step', () => {
    expect(penalisedHint({ equipment: 'barbell', flags: [] }, prev, 1)).toMatchObject({ weight: 62.5, reps: 8 });
  });
  it('adds dumbbell and cable step', () => {
    expect(penalisedHint({ equipment: 'dumbbell', flags: [] }, prev, 1).weight).toBe(61);
    expect(penalisedHint({ equipment: 'cable', flags: [] }, prev, 1).weight).toBe(61);
  });
  it('gives elbow-flagged movements reps, not load', () => {
    expect(penalisedHint({ equipment: 'cable', flags: ['elbow'] }, prev, 1)).toMatchObject({ weight: 60, reps: 10 });
  });
  it('scales with multiplier and custom amounts', () => {
    const p = { ...DEFAULT_PENALTY, barbellKg: 5 };
    expect(penalisedHint({ equipment: 'barbell', flags: [] }, prev, 2, p).weight).toBe(70);
  });
  it('leaves hints alone with no penalty, machine/bodyweight, or no previous', () => {
    expect(penalisedHint({ equipment: 'barbell', flags: [] }, prev, 0).weight).toBe(60);
    expect(penalisedHint({ equipment: 'machine', flags: [] }, prev, 1).weight).toBe(60);
    expect(penalisedHint({ equipment: 'barbell', flags: [] }, undefined, 1).weight).toBeNull();
  });
});
