import { describe, expect, it } from 'vitest';
import { buildReport } from './report';
import { SEED_MOVEMENTS } from '../data/movements';
import { BodyEntry, Session, SetEntry } from '../types';

const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
const st = (weight: number, reps: number, kind?: SetEntry['kind']): SetEntry => ({ weight, reps, done: true, kind });
const sess = (d: number, movements: Session['movements'], extra: Partial<Session> = {}): Session =>
  ({ id: String(d), date: at(d), focus: 'Chest', type: 'Normal', status: 'completed', movements, author: 'app', updatedAt: '', ...extra });
const BENCH = 'barbell-bench-press-top-set-back-off';
const bench = (sets: SetEntry[]) => [{ movementId: BENCH, name: 'Bench', sets }];
const body = (d: number, h: number, extra: Partial<BodyEntry>): BodyEntry => ({ id: `${d}${h}`, date: at(d, h), author: 'app', updatedAt: '', ...extra });

// Week of Mon 12 Oct; previous week Mon 5 Oct.
const start = new Date(2026, 9, 12), end = new Date(2026, 9, 19);
const sessions = [
  sess(1, bench([st(90, 5)])),
  sess(6, bench([st(80, 8), st(80, 8)])),
  sess(13, bench([st(40, 10, 'warmup'), st(85, 8), st(70, 6, 'drop')])),
  sess(15, bench([st(85, 8, 'failure')])),
  sess(16, [], { status: 'skipped' }),
];
const bodyData = [body(6, 22, { weight: 91 }), body(7, 23, { weight: 90 }), body(13, 22, { weight: 89, waist: 90 }), body(14, 8, { weight: 80 }), body(15, 23, { weight: 88.5, waist: 89 })];
const r = buildReport(sessions, SEED_MOVEMENTS, bodyData, start, end, { perWeek: 4, muscleTarget: 10 });

describe('period report', () => {
  it('counts sessions vs plan', () => {
    expect([r.weeks, r.completed, r.skipped, r.planned, r.missed]).toEqual([1, 2, 1, 4, 2]);
  });
  it('volume excludes warm-ups and compares with the previous period', () => {
    expect(r.volumeKg).toBe(85 * 8 + 70 * 6 + 85 * 8);
    expect(r.prevVolumeKg).toBe(1280);
    expect(r.volumeChangePct).toBe(39.1);
  });
  it('e1RM change per lift and PR vs all history before', () => {
    expect(r.lifts).toEqual([{ id: BENCH, name: 'Bench', e1rm: 107.7, prevPeriod: 101.3, allTimeBefore: 105, pr: true, change: 6.4 }]);
  });
  it('sets per muscle per week vs target', () => {
    const chest = r.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest).toMatchObject({ perWeek: 3, status: 'under' });
    expect(r.muscles.find((m) => m.muscle === 'triceps')!.perWeek).toBe(1.5);
    const over = buildReport(Array.from({ length: 4 }, (_, i) => sess(12 + i, bench(Array(5).fill(st(60, 10))))), SEED_MOVEMENTS, [], start, end, { perWeek: 4, muscleTarget: 10 });
    expect(over.muscles.find((m) => m.muscle === 'chest')!.status).toBe('over');
  });
  it('weight average falls back to every weigh-in when none are fasted', () => {
    expect(r.body).toEqual({ weightAvg: 85.83, prevWeightAvg: 90.5, weightChange: -4.67, bodyFatChange: null, waistChange: -1 });
  });
  it('weight average prefers fasted weigh-ins in each period on its own', () => {
    const mixed = [
      body(6, 22, { weight: 91 }),
      body(7, 8, { weight: 90, fasted: true }),
      body(13, 7, { weight: 89, fasted: true, waist: 90 }),
      body(14, 8, { weight: 80 }),
      body(15, 23, { weight: 88.5, fasted: false, waist: 89 }),
    ];
    const rep = buildReport(sessions, SEED_MOVEMENTS, mixed, start, end, { perWeek: 4, muscleTarget: 10 });
    expect(rep.body.weightAvg).toBe(89);
    expect(rep.body.prevWeightAvg).toBe(90);
    expect(rep.body.weightChange).toBe(-1);
    expect(rep.body.waistChange).toBe(-1);
    expect(rep.body.bodyFatChange).toBeNull();
  });
  it('counts set types', () => {
    expect(r.setKinds).toEqual({ warmup: 1, working: 1, drop: 1, failure: 1 });
  });
  it('month spans divide sets by weeks and handle empty history', () => {
    const m = buildReport([], SEED_MOVEMENTS, [], new Date(2026, 8, 28), new Date(2026, 9, 26), { perWeek: 4, muscleTarget: 10 });
    expect([m.weeks, m.planned, m.missed, m.prevVolumeKg, m.volumeChangePct, m.lifts.length, m.body.weightAvg]).toEqual([4, 16, 16, null, null, 0, null]);
  });
});
