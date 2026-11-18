import { describe, expect, it } from 'vitest';
import { CUT_MAIN_LIFT_IDS } from '../data/cut';
import { BODY_HEADERS, SESSION_HEADERS, sessionRows, sessionsTable } from './csv';
import {
  assignCutDay,
  chooseProgramme,
  DEFAULT_CUT_DAYS,
  deloadPrompt,
  deloadSetCount,
  e1rmDropWarning,
  nextCutSession,
  programmeWeek,
  scheduledDeload,
  stalledLifts,
  weeklyLossWarning,
} from './cut';
import { migrate } from './migrate';
import { loadStep, suggestNext } from './progression';
import { weekStart } from './week';
import { BodyEntry, Session, SetEntry } from '../types';

const set = (weight: number, reps: number, extra: Partial<SetEntry> = {}): SetEntry => ({ weight, reps, done: true, ...extra });
const press = { repMin: 8, repMax: 12, equipment: 'dumbbell' as const, flags: [] as string[] };
const cable = { repMin: 12, repMax: 15, equipment: 'cable' as const, flags: [] as string[] };

const session = (date: string, movementId: string, sets: SetEntry[], name = 'Neutral-grip incline DB press'): Session => ({
  id: date,
  date,
  focus: 'Chest',
  type: 'Normal',
  status: 'completed',
  letter: 'A',
  movements: [{ movementId, name, sets }],
  author: 'app',
  updatedAt: date,
});

describe('double progression at 1–2 RIR', () => {
  it('adds the smallest dumbbell step when every set hits the top at 1–2 RIR', () => {
    const next = suggestNext(press, [set(24, 12, { rir: 2 }), set(24, 12, { rir: 1 }), set(24, 12, { rir: 2 })]);
    expect(loadStep('dumbbell')).toBe(2);
    expect(next).toEqual({ weight: 26, reps: 8, reason: 'add-weight' });
  });

  it('adds the cable step, not a dumbbell step, for a cable isolation lift', () => {
    expect(loadStep('cable')).toBe(2.5);
    expect(suggestNext(cable, [set(15, 15, { rir: 2 }), set(15, 15, { rir: 2 }), set(15, 15, { rir: 1 })]))
      .toEqual({ weight: 17.5, reps: 12, reason: 'add-weight' });
  });

  it('does not add load when the top set was a grind at 0 RIR', () => {
    expect(suggestNext(press, [set(24, 12, { rir: 0 }), set(24, 12, { rir: 1 }), set(24, 12, { rir: 2 })]))
      .toEqual({ weight: 24, reps: 12, reason: 'repeat' });
  });

  it('keeps adding reps until the top when RIR is in range but the reps are not', () => {
    expect(suggestNext(press, [set(24, 10, { rir: 2 }), set(24, 11, { rir: 2 })]))
      .toEqual({ weight: 24, reps: 11, reason: 'add-reps' });
  });

  it('still adds weight from older logs that have no RIR', () => {
    expect(suggestNext(press, [set(24, 12), set(24, 12), set(24, 12)]))
      .toEqual({ weight: 26, reps: 8, reason: 'add-weight' });
  });

  it('adds load on an elbow-flagged curl when the printed top is hit at 1–2 RIR', () => {
    const curl = { repMin: 10, repMax: 12, equipment: 'dumbbell' as const, flags: ['elbow'] };
    expect(suggestNext(curl, [set(14, 12, { rir: 2 }), set(14, 12, { rir: 1 })], { extraReps: 2 }))
      .toEqual({ weight: 16, reps: 10, reason: 'add-weight' });
  });
});

describe('deload triggers', () => {
  const anchorMonday = weekStart(new Date('2026-11-18T12:00:00'));
  const week = (n: number) => {
    const date = new Date(anchorMonday);
    date.setDate(date.getDate() + 7 * (n - 1) + 2);
    return date;
  };

  it('asks for a deload on every 6th week of the cut, and not the weeks between', () => {
    expect(programmeWeek(week(1))).toBe(1);
    expect(scheduledDeload(week(1))).toBe(false);
    expect(scheduledDeload(week(5))).toBe(false);
    expect(scheduledDeload(week(6))).toBe(true);
    expect(scheduledDeload(week(7))).toBe(false);
    expect(scheduledDeload(week(12))).toBe(true);
    expect(deloadPrompt([], week(6)).scheduled).toBe(true);
    expect(deloadPrompt([], week(6)).active).toBe(true);
  });

  it('cuts a 3-set movement to about half the sets', () => {
    expect(deloadSetCount(3)).toBe(2);
    expect(deloadSetCount(2)).toBe(1);
    expect(deloadSetCount(1)).toBe(1);
  });

  it('asks for a deload after two consecutive sessions of falling reps on the same lift', () => {
    const id = 'cut-romanian-deadlift';
    const falling = [
      session('2026-11-02T09:00:00.000Z', id, [set(80, 10), set(80, 10)], 'Romanian deadlift'),
      session('2026-11-09T09:00:00.000Z', id, [set(80, 9), set(80, 9)], 'Romanian deadlift'),
      session('2026-11-16T09:00:00.000Z', id, [set(80, 8), set(80, 8)], 'Romanian deadlift'),
    ];
    expect(stalledLifts(falling, [id])).toEqual([{ id, name: 'Romanian deadlift' }]);
    expect(deloadPrompt(falling, week(1), '2026-11-18', [id]).lifts.map((lift) => lift.name)).toEqual(['Romanian deadlift']);
    expect(deloadPrompt(falling, week(1), '2026-11-18', [id]).active).toBe(true);

    const held = [
      session('2026-11-02T09:00:00.000Z', id, [set(80, 10)], 'Romanian deadlift'),
      session('2026-11-09T09:00:00.000Z', id, [set(80, 9)], 'Romanian deadlift'),
      session('2026-11-16T09:00:00.000Z', id, [set(80, 9)], 'Romanian deadlift'),
    ];
    expect(stalledLifts(held, [id])).toEqual([]);
  });
});

const body = (year: number, month: number, day: number, weight: number, fasted = true): BodyEntry => ({
  id: `${year}-${month}-${day}-${weight}`,
  date: new Date(year, month, day, 8).toISOString(),
  weight,
  fasted,
  author: 'app',
  updatedAt: '',
});

describe('cut warning flags', () => {
  it('flags two consecutive fasted weeks losing more than about 1.2 kg', () => {
    const flagged = weeklyLossWarning([
      body(2026, 10, 2, 102.6),
      body(2026, 10, 9, 101.3),
      body(2026, 10, 16, 100),
    ]);
    expect(flagged?.losses).toEqual([1.3, 1.3]);
  });

  it('stays quiet at 1.2 kg, when a week is missing, or when the weigh-ins were not fasted', () => {
    expect(weeklyLossWarning([
      body(2026, 10, 2, 102.6),
      body(2026, 10, 9, 101.4),
      body(2026, 10, 16, 100),
    ])).toBeNull();
    expect(weeklyLossWarning([
      body(2026, 10, 2, 102.6),
      body(2026, 10, 16, 100),
      body(2026, 10, 23, 98),
    ])).toBeNull();
    expect(weeklyLossWarning([
      body(2026, 10, 2, 102.6, false),
      body(2026, 10, 9, 101, false),
      body(2026, 10, 16, 99, false),
    ])).toBeNull();
  });

  it('flags a main lift whose estimated 1RM drops more than 10% from its recent best', () => {
    const id = 'cut-neutral-incline-db-press';
    const latest = new Date(2026, 10, 16, 9);
    const recent = new Date(latest);
    recent.setDate(recent.getDate() - 14);
    const drops = e1rmDropWarning([
      session(recent.toISOString(), id, [set(40, 8, { kind: 'warmup' }), set(24, 12), set(24, 12)]),
      session(latest.toISOString(), id, [set(18, 8), set(18, 8)]),
    ], [id]);
    expect(drops).toHaveLength(1);
    expect(drops[0].name).toBe('Neutral-grip incline DB press');
    expect(drops[0].drop).toBeGreaterThan(0.1);
    expect(drops[0].best).toBeGreaterThan(drops[0].latest);
  });

  it('ignores a drop of 10% or less, and a best from outside the recent window', () => {
    const id = 'cut-flat-db-press';
    const latest = new Date(2026, 10, 16, 9);
    const recent = new Date(latest);
    recent.setDate(recent.getDate() - 7);
    const held = e1rmDropWarning([
      session(recent.toISOString(), id, [set(30, 8)], 'Flat DB press'),
      session(latest.toISOString(), id, [set(30, 8)], 'Flat DB press'),
    ], [id]);
    expect(held).toEqual([]);

    const old = new Date(latest);
    old.setDate(old.getDate() - 70);
    const stale = e1rmDropWarning([
      session(old.toISOString(), id, [set(40, 12)], 'Flat DB press'),
      session(latest.toISOString(), id, [set(20, 8)], 'Flat DB press'),
    ], [id]);
    expect(stale).toEqual([]);
    expect(CUT_MAIN_LIFT_IDS).toContain('cut-neutral-incline-db-press');
    expect(CUT_MAIN_LIFT_IDS).not.toContain('cut-hammer-curl');
  });
});

describe('sheet export columns', () => {
  it('appends session letter, elbow pain and RIR after the existing headers', () => {
    const previous = [
      'date', 'focus', 'type', 'status', 'swap', 'movement_id', 'movement', 'superset', 'set', 'kind', 'weight_kg', 'reps', 'done',
      'duration_min', 'session_notes', 'movement_notes', 'movement_duration_min', 'distance_km', 'effort', 'drop_start_kg', 'drop_end_kg',
    ];
    expect(SESSION_HEADERS.slice(0, previous.length)).toEqual(previous);
    expect(SESSION_HEADERS.slice(previous.length)).toEqual(['session_letter', 'elbow_pain', 'rir']);
    expect(BODY_HEADERS).toEqual([
      'date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'energy', 'elbow', 'fasted', 'week_start', 'weekly_fasted_avg',
    ]);

    const logged = session('2026-11-16T09:00:00.000Z', 'cut-neutral-incline-db-press', [
      set(24, 12, { rir: 2 }),
    ]);
    logged.elbowPain = 3;
    const table = sessionsTable([logged]);
    const row = sessionRows([logged])[0];
    expect(table[0]).toEqual(SESSION_HEADERS);
    expect(row[SESSION_HEADERS.indexOf('session_letter')]).toBe('A');
    expect(row[SESSION_HEADERS.indexOf('elbow_pain')]).toBe(3);
    expect(row[SESSION_HEADERS.indexOf('rir')]).toBe(2);
    expect(row[SESSION_HEADERS.indexOf('weight_kg')]).toBe(24);
    expect(row[SESSION_HEADERS.indexOf('reps')]).toBe(12);
  });

  it('leaves letter, elbow pain and RIR blank on older sessions', () => {
    const row = sessionRows([session('2026-10-20T08:00:00.000Z', 'b', [set(80, 8)], 'Bench')])[0];
    const older = { ...session('2026-10-20T08:00:00.000Z', 'b', [set(80, 8)], 'Bench'), letter: undefined, elbowPain: undefined };
    const blank = sessionRows([older])[0];
    expect(blank[SESSION_HEADERS.indexOf('session_letter')]).toBe('');
    expect(blank[SESSION_HEADERS.indexOf('elbow_pain')]).toBe('');
    expect(blank[SESSION_HEADERS.indexOf('rir')]).toBe('');
    expect(row[SESSION_HEADERS.indexOf('session_letter')]).toBe('A');
  });
});

describe('programme migration', () => {
  const base = { version: 2, movements: [], rotation: { order: ['Chest'], nextIndex: 2, counters: { Chest: 1 } } };

  it('keeps another person\'s sessions on the focus rotation', () => {
    const saved = migrate({
      ...base,
      sessions: [session('2026-10-01T00:00:00.000Z', 'bench', [])],
      settings: { displayName: 'Sam', targets: { proteinMin: 140, proteinMax: 160, kcalMin: 2100, kcalMax: 2300, waterGlasses: 6 } },
    });
    expect(saved.settings.programme).toBe('rotation');
    expect(saved.sessions).toHaveLength(1);
    expect(saved.rotation.nextIndex).toBe(2);
    expect(saved.settings.targets.proteinMax).toBe(160);
    expect(saved.settings.targets.kcalMax).toBe(2300);
  });

  it('makes the cut Chris\'s default without dropping his log, and keeps an explicit choice', () => {
    const chris = migrate({
      ...base,
      sessions: [session('2026-10-01T00:00:00.000Z', 'bench', [])],
      settings: { displayName: 'Chris' },
    });
    expect(chris.settings.programme).toBe('cut');
    expect(chris.sessions).toHaveLength(1);
    expect(chris.settings.targets).toMatchObject({ protein: 178, kcal: 1780 });
    expect(chris.settings.cutDays).toEqual(DEFAULT_CUT_DAYS);

    const optedOut = migrate({
      ...base,
      sessions: [session('2026-10-01T00:00:00.000Z', 'bench', [])],
      settings: { displayName: 'Chris', programme: 'rotation' },
    });
    expect(optedOut.settings.programme).toBe('rotation');
    expect(chooseProgramme({ sessions: [], settings: { displayName: 'Sam' } })).toBe('cut');
  });

  it('schedules A–D on Monday, Tuesday, Thursday and Friday, and lets a day move', () => {
    const wednesday = new Date(2026, 10, 18, 9);
    expect(wednesday.getDay()).toBe(3);
    expect(nextCutSession(wednesday, DEFAULT_CUT_DAYS).letter).toBe('C');
    const moved = assignCutDay(DEFAULT_CUT_DAYS, 'A', 4);
    expect(moved.A).toBe(4);
    expect(moved.C).toBe(1);
    const thursday = new Date(2026, 10, 19, 9);
    expect(nextCutSession(thursday, moved).letter).toBe('A');
    expect(assignCutDay(DEFAULT_CUT_DAYS, 'A', 3).C).toBe(4);
  });
});
