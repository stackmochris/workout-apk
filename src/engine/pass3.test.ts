import { describe, expect, it } from 'vitest';
import { plateLoad, roundLoadable } from './plates';
import { suggestNext } from './progression';
import { e1rm } from './history';
import { bodyCsv, csvCell, sessionsCsv } from './csv';
import { DEFAULT_SETTINGS, migrate } from './migrate';
import { eveningWeights, liftSeries, movingAvg, muscleFatigue, recoveryHint, weeklyMuscleSets } from './analytics';
import { musclesFor } from '../data/muscles';
import { SEED_MOVEMENTS } from '../data/movements';
import { parseBackup, pruneKeys } from '../lib/backup';
import { BodyEntry, Session, SetEntry } from '../types';

const set = (weight: number, reps: number, kind?: SetEntry['kind']): SetEntry => ({ weight, reps, done: true, kind });
const bench = { repMin: 5, repMax: 8, equipment: 'barbell' as const, flags: [] };
const curl = { repMin: 10, repMax: 12, equipment: 'dumbbell' as const, flags: ['elbow'] };

describe('e1RM (Epley)', () => {
  it('matches kg × (1 + reps/30)', () => {
    expect(e1rm(100, 5)).toBe(116.7);
    expect(e1rm(60, 10)).toBe(80);
    expect(e1rm(100, 1)).toBe(103.3);
  });
});

describe('plate calculator', () => {
  it('breaks a target into plates per side', () => {
    expect(plateLoad(100)).toEqual({ total: 100, perSide: [25, 15] });
    expect(plateLoad(62.5)).toEqual({ total: 62.5, perSide: [20, 1.25] });
    expect(plateLoad(20)).toEqual({ total: 20, perSide: [] });
    expect(plateLoad(15)).toEqual({ total: 20, perSide: [] });
  });
  it('uses 1.25 kg plates and rounds down to loadable', () => {
    expect(plateLoad(23.5).total).toBe(22.5);
    expect(plateLoad(23.5).perSide).toEqual([1.25]);
  });
  it('honours a custom bar and plate set', () => {
    expect(plateLoad(60, 15, [20, 10, 5])).toEqual({ total: 55, perSide: [20] });
  });
  it('rounds to the nearest loadable weight', () => {
    expect(roundLoadable(61)).toBe(60);
    expect(roundLoadable(61.9)).toBe(62.5);
    expect(roundLoadable(63.75)).toBe(65);
  });
});

describe('double progression', () => {
  it('adds reps until every working set hits the top', () => {
    expect(suggestNext(bench, [set(80, 8), set(80, 6), set(80, 6)])).toEqual({ weight: 80, reps: 7, reason: 'add-reps' });
  });
  it('adds weight and resets reps once the top is hit', () => {
    expect(suggestNext(bench, [set(80, 8), set(80, 8), set(80, 8)])).toEqual({ weight: 82.5, reps: 5, reason: 'add-weight' });
  });
  it('ignores warm-up and drop sets', () => {
    expect(suggestNext(bench, [set(40, 3, 'warmup'), set(80, 8), set(80, 8), set(60, 4, 'drop')]).reason).toBe('add-weight');
  });
  it('elbow lifts go reps first past the top of the range', () => {
    expect(suggestNext(curl, [set(14, 12), set(14, 12)])).toEqual({ weight: 14, reps: 13, reason: 'add-reps' });
    expect(suggestNext(curl, [set(14, 14), set(14, 14)])).toEqual({ weight: 16, reps: 10, reason: 'add-weight' });
  });
  it('rounds barbell jumps to loadable plates', () => {
    expect(suggestNext(bench, [set(81, 8)]).weight).toBe(82.5);
  });
  it('max-rep movements just add a rep', () => {
    expect(suggestNext({ repMin: null, repMax: null, equipment: 'bodyweight', flags: [] }, [{ weight: null, reps: 9, done: true }]))
      .toEqual({ weight: null, reps: 10, reason: 'add-reps' });
  });
  it('no history gives the bottom of the range', () => {
    expect(suggestNext(bench, undefined)).toEqual({ weight: null, reps: 5, reason: 'none' });
  });
});

const sess = (date: string, focus: Session['focus'], movements: Session['movements'], extra: Partial<Session> = {}): Session =>
  ({ id: date, date, focus, type: 'Normal', status: 'completed', movements, author: 'app', updatedAt: date, ...extra });

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });
  it('writes one row per set', () => {
    const csv = sessionsCsv([sess('2026-10-20T08:00:00.000Z', 'Chest', [{ movementId: 'b', name: 'Bench, flat', sets: [set(40, 5, 'warmup'), set(80, 8)] }])]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('date,focus,type,status,swap,movement_id,movement,superset,set,kind,weight_kg,reps,done');
    expect(lines[1]).toBe('2026-10-20T08:00:00.000Z,Chest,Normal,completed,,b,"Bench, flat",,1,warmup,40,5,yes');
    expect(lines[2]).toContain(',2,working,80,8,yes');
  });
  it('writes body stats sorted by date', () => {
    const e = (date: string, weight: number): BodyEntry => ({ id: date, date, weight, author: 'app', updatedAt: date });
    expect(bodyCsv([e('2026-10-02', 90), e('2026-10-01', 91)]).split('\n')[1]).toBe('2026-10-01,91,,');
  });
});

describe('migration', () => {
  it('upgrades v1 data without losing sessions or settings', () => {
    const v1 = { version: 1, sessions: [sess('2026-10-01T00:00:00Z', 'Leg', [])], movements: SEED_MOVEMENTS.slice(0, 3), settings: { restSeconds: 120, penalty: { barbellKg: 5 } }, draft: null };
    const d = migrate(v1);
    expect(d.version).toBe(2);
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].author).toBe('app');
    expect(d.sessions[0].updatedAt).toBe('2026-10-01T00:00:00Z');
    expect(d.settings.restSeconds).toBe(120);
    expect(d.settings.penalty.barbellKg).toBe(5);
    expect(d.settings.penalty.dumbbellCableKg).toBe(1);
    expect(d.settings.barKg).toBe(20);
    expect(d.settings.plates).toContain(1.25);
    expect(d.body).toEqual([]);
    expect(d.movements.length).toBe(SEED_MOVEMENTS.length);
  });
  it('keeps edited movements and appends new seeds', () => {
    const edited = { ...SEED_MOVEMENTS[0], repMax: 99 };
    const d = migrate({ movements: [edited], sessions: [] });
    expect(d.movements[0].repMax).toBe(99);
    expect(d.movements.length).toBe(SEED_MOVEMENTS.length);
  });
  it('returns fresh data for junk', () => {
    expect(migrate(null).settings).toEqual(DEFAULT_SETTINGS);
  });
  it('import refuses non-backups', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow();
    expect(parseBackup('{"sessions":[]}').version).toBe(2);
  });
  it('prunes old snapshots, keeping the newest', () => {
    const keys = ['b:2026-10-01', 'b:2026-10-03', 'b:2026-10-02'];
    expect(pruneKeys(keys, 2)).toEqual(['b:2026-10-01']);
  });
});

describe('analytics', () => {
  const now = new Date(2026, 9, 22, 12);
  const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
  const sessions = [
    sess(at(19), 'Chest', [{ movementId: 'barbell-bench-press-top-set-back-off', name: 'Barbell bench press', sets: [set(40, 5, 'warmup'), set(80, 8), set(80, 6)] }]),
    sess(at(21), 'Back', [{ movementId: 'lat-pulldown-paused-controlled', name: 'Lat pulldown', sets: [set(60, 10), set(60, 10), set(60, 9)] }]),
    sess(at(21), 'Back', [{ movementId: 'x', name: 'Swap', sets: [set(0, 50)] }], { swap: true }),
  ];
  it('maps movements to muscles', () => {
    expect(musclesFor({ name: 'Leg curl', focus: 'Leg' }).primary).toEqual(['hamstrings']);
    expect(musclesFor({ name: 'Leg press (or hack)', focus: 'Leg' }).primary).toEqual(['quads', 'glutes']);
    expect(musclesFor({ name: 'Machine overhead press', focus: 'Shoulder' }).primary).toEqual(['frontDelts']);
  });
  it('lift series excludes warm-ups', () => {
    expect(liftSeries(sessions, 'barbell-bench-press-top-set-back-off')).toEqual([{ date: at(19), e1rm: 101.3, top: 80, volume: 1120 }]);
  });
  it('counts weekly hard sets per muscle', () => {
    const w = weeklyMuscleSets(sessions, SEED_MOVEMENTS, now);
    expect(w.chest).toBe(2);
    expect(w.triceps).toBe(1);
    expect(w.lats).toBe(4); // swaps count as training volume
    expect(w.biceps).toBe(1.5);
  });
  it('fatigue fades with time and drives recovery hints', () => {
    const f = muscleFatigue(sessions, SEED_MOVEMENTS, now);
    expect(f.lats!).toBeGreaterThan(f.chest!);
    expect(recoveryHint('Back', f, 0.15)).toContain('lats');
    expect(recoveryHint('Leg', f)).toEqual([]);
  });
  it('trends only late-evening weigh-ins, one per evening', () => {
    const e = (d: number, h: number, weight: number): BodyEntry => ({ id: `${d}${h}`, date: new Date(2026, 9, d, h).toISOString(), weight, author: 'app', updatedAt: '' });
    const w = eveningWeights([e(20, 7, 88), e(20, 22, 90), e(21, 1, 89.5), e(21, 23, 89)]);
    expect(w.map((x) => [x.day, x.weight])).toEqual([['2026-10-20', 89.5], ['2026-10-21', 89]]);
    expect(movingAvg([90, 88, 86], 2)).toEqual([90, 89, 87]);
  });
});
