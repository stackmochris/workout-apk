import { describe, expect, it } from 'vitest';
import { plateLoad, roundLoadable } from './plates';
import { suggestNext } from './progression';
import { e1rm } from './history';
import { bodyCsv, csvCell, sessionsCsv } from './csv';
import { DEFAULT_SETTINGS, migrate } from './migrate';
import { SUPERSET_FATIGUE_MULT, checkinFastedDefault, fastedWeeklyWeights, liftSeries, muscleFatigue, periodWeightAvg, recoveryHint, supersetUsage, weeklyMuscleSets } from './analytics';
import { weekStart } from './week';
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
    expect(lines[0]).toBe('date,focus,type,status,swap,movement_id,movement,superset,set,kind,weight_kg,reps,done,duration_min,session_notes,movement_notes,movement_duration_min,distance_km,effort,drop_start_kg,drop_end_kg');
    expect(lines[1]).toBe('2026-10-20T08:00:00.000Z,Chest,Normal,completed,,b,"Bench, flat",,1,warmup,40,5,yes,,,,,,,,');
    expect(lines[2]).toContain(',2,working,80,8,yes');
  });
  it('adds session and movement columns, including a cardio row with no sets', () => {
    const csv = sessionsCsv([sess('2026-10-21T18:00:00.000Z', 'HIIT', [
      { movementId: 'b', name: 'Bench', sets: [{ weight: 80, reps: 6, done: true, kind: 'drop', dropStart: 100, dropEnd: 60 }], notes: 'paused', durationMin: 15 },
      { movementId: 'run', name: 'Easy run', sets: [], durationMin: 32, distanceKm: 5.2, notes: 'park loop' },
      { movementId: 'mob', name: 'Mobility', sets: [], notes: 'hips' },
      { movementId: 'x', name: 'Skipped movement', sets: [] },
    ], { durationMin: 50, distanceKm: 9, effort: 7, notes: 'evening' })]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-10-21T18:00:00.000Z,HIIT,Normal,completed,,b,Bench,,1,drop,80,6,yes,50,evening,paused,15,9,7,100,60');
    expect(lines[2]).toBe('2026-10-21T18:00:00.000Z,HIIT,Normal,completed,,run,Easy run,,,,,,,50,evening,park loop,32,5.2,7,,');
    expect(lines[3]).toBe('2026-10-21T18:00:00.000Z,HIIT,Normal,completed,,mob,Mobility,,,,,,,50,evening,hips,,9,7,,');
  });
  it('writes body stats sorted by date, with fasted as yes or empty', () => {
    const e = (date: string, extra: Partial<BodyEntry> = {}): BodyEntry => ({ id: date, date, author: 'app', updatedAt: date, ...extra });
    const lines = bodyCsv([
      e('2026-10-02', { weight: 90, fasted: true, energy: 7, elbow: 'ok' }),
      e('2026-10-01', { weight: 91, fasted: false, bodyFat: 18, waist: 86 }),
      e('2026-10-03', { weight: 89 }),
    ]).trim().split('\n');
    expect(lines[0]).toBe('date,weight_kg,body_fat_pct,waist_cm,energy,elbow,fasted');
    expect(lines[1]).toBe('2026-10-01,91,18,86,,,');
    expect(lines[2]).toBe('2026-10-02,90,,,7,ok,yes');
    expect(lines[3]).toBe('2026-10-03,89,,,,,');
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
  it('maps a saved pride theme to green and keeps the other packs', () => {
    expect(migrate({ settings: { theme: 'pride' }, sessions: [] }).settings.theme).toBe('green');
    expect(migrate({ settings: { theme: 'union-jack' }, sessions: [] }).settings.theme).toBe('union-jack');
    expect(migrate({ settings: { theme: 'jerusalem' }, sessions: [] }).settings.theme).toBe('jerusalem');
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
  it('averages fasted weigh-ins by week and leaves unmarked logs out', () => {
    const e = (d: number, h: number, extra: Partial<BodyEntry>): BodyEntry => ({ id: `${d}${h}`, date: new Date(2026, 9, d, h, h === 23 ? 59 : 0).toISOString(), author: 'app', updatedAt: '', ...extra });
    const w = fastedWeeklyWeights([
      e(6, 7, { weight: 80, fasted: true }),
      e(7, 8, { weight: 82, fasted: true }),
      e(8, 22, { weight: 90, fasted: false }),
      e(9, 9, { weight: 88 }),
      e(11, 23, { weight: 84, fasted: true }),
      e(12, 0, { weight: 79, fasted: true }),
      e(13, 7, { bodyFat: 18, fasted: true }),
    ]);
    const weekOf5 = weekStart(new Date(2026, 9, 5)).toISOString();
    const weekOf12 = weekStart(new Date(2026, 9, 12)).toISOString();
    expect(w).toEqual([{ date: weekOf5, weight: 82 }, { date: weekOf12, weight: 79 }]);
    expect(fastedWeeklyWeights([])).toEqual([]);
  });
  it('period weight average prefers fasted entries and falls back otherwise', () => {
    const e = (d: number, h: number, extra: Partial<BodyEntry>): BodyEntry => ({ id: `${d}${h}`, date: new Date(2026, 9, d, h).toISOString(), author: 'app', updatedAt: '', ...extra });
    const start = new Date(2026, 9, 12);
    const end = new Date(2026, 9, 19);
    expect(periodWeightAvg([
      e(11, 23, { weight: 70, fasted: true }),
      e(12, 0, { weight: 80, fasted: true }),
      e(14, 8, { weight: 99 }),
      e(19, 0, { weight: 60, fasted: true }),
    ], start, end)).toBe(80);
    expect(periodWeightAvg([
      e(12, 8, { weight: 80 }),
      e(13, 22, { weight: 90, fasted: false }),
    ], start, end)).toBe(85);
    expect(periodWeightAvg([
      e(12, 8, { weight: 80 }),
      e(13, 7, { weight: 90, fasted: true }),
    ], start, end)).toBe(90);
    expect(periodWeightAvg([], start, end)).toBeNull();
  });
  it('checks the weekly check-in fasted box only before noon', () => {
    expect(checkinFastedDefault(new Date(2026, 9, 20, 0, 0))).toBe(true);
    expect(checkinFastedDefault(new Date(2026, 9, 20, 11, 59))).toBe(true);
    expect(checkinFastedDefault(new Date(2026, 9, 20, 12, 0))).toBe(false);
    expect(checkinFastedDefault(new Date(2026, 9, 20, 23, 30))).toBe(false);
  });

  it('adds 12% fatigue for hard sets in a real superset only', () => {
    expect(SUPERSET_FATIGUE_MULT).toBe(1.12);
    const when = new Date(2026, 9, 22, 9);
    const iso = when.toISOString();
    const bench = [set(40, 5, 'warmup'), set(80, 8), set(80, 6)];
    const fly = [set(15, 12)];
    const pull = [set(60, 10), set(50, 8, 'drop')];
    const plain = sess(iso, 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: bench },
      { movementId: 'fly-x', name: 'Cable fly', sets: fly },
      { movementId: 'pull-x', name: 'Lat pulldown', sets: pull },
    ]);
    const linked = sess(iso, 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: bench, superset: 'g1' },
      { movementId: 'fly-x', name: 'Cable fly', sets: fly, superset: 'g1' },
      { movementId: 'pull-x', name: 'Lat pulldown', sets: pull },
    ]);
    const lone = sess(iso, 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: bench, superset: 'only' },
      { movementId: 'fly-x', name: 'Cable fly', sets: fly, superset: 'other' },
      { movementId: 'pull-x', name: 'Lat pulldown', sets: pull, superset: 'pull' },
    ]);
    const straight = muscleFatigue([plain], [], when);
    const paired = muscleFatigue([linked], [], when);
    expect(paired.chest! / straight.chest!).toBeCloseTo(SUPERSET_FATIGUE_MULT, 5);
    expect(paired.triceps! / straight.triceps!).toBeCloseTo(SUPERSET_FATIGUE_MULT, 5);
    expect(paired.lats).toBe(straight.lats);
    expect(muscleFatigue([lone], [], when)).toEqual(straight);
    expect(weeklyMuscleSets([linked], [], when)).toEqual(weeklyMuscleSets([plain], [], when));
    expect(liftSeries([linked], 'bench-x')).toEqual(liftSeries([plain], 'bench-x'));
  });

  it('counts supersets and their hard sets inside the period', () => {
    const start = new Date(2026, 9, 19);
    const end = new Date(start.getTime() + 7 * 864e5 + 3600e3);
    const undone = { weight: 80, reps: 8, done: false };
    const week = sess(new Date(2026, 9, 20, 9).toISOString(), 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: [set(40, 5, 'warmup'), set(80, 8), set(60, 8, 'drop'), set(80, 6, 'failure'), undone], superset: 'g1' },
      { movementId: 'fly-x', name: 'Cable fly', sets: [set(15, 12)], superset: 'g1' },
      { movementId: 'pull-x', name: 'Lat pulldown', sets: [set(60, 10), set(60, 10)] },
      { movementId: 'curl-x', name: 'Curl', sets: [set(12, 10)], superset: 'lonely' },
    ]);
    const arms = sess(new Date(2026, 9, 21, 18).toISOString(), 'Arm', [
      { movementId: 'push-x', name: 'Pushdown', sets: [set(20, 12)], superset: 'g2' },
      { movementId: 'curl-x', name: 'Curl', sets: [set(12, 10)], superset: 'g2' },
      { movementId: 'push-y', name: 'Pushdown', sets: [set(20, 12)], superset: 'g3' },
      { movementId: 'curl-y', name: 'Curl', sets: [set(12, 10)], superset: 'g3' },
    ]);
    const earlier = sess(new Date(2026, 9, 12, 9).toISOString(), 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: [set(80, 8)], superset: 'old' },
      { movementId: 'fly-x', name: 'Cable fly', sets: [set(15, 12)], superset: 'old' },
    ]);
    const skipped = sess(new Date(2026, 9, 22, 9).toISOString(), 'Chest', [
      { movementId: 'bench-x', name: 'Bench press', sets: [set(80, 8)], superset: 'sk' },
      { movementId: 'fly-x', name: 'Cable fly', sets: [set(15, 12)], superset: 'sk' },
    ], { status: 'skipped' });
    expect(supersetUsage([week, arms, earlier, skipped], start, end)).toEqual({ supersets: 3, sets: 8 });
    expect(supersetUsage([week, arms, earlier, skipped])).toEqual({ supersets: 4, sets: 10 });
    expect(supersetUsage([])).toEqual({ supersets: 0, sets: 0 });
  });
});
