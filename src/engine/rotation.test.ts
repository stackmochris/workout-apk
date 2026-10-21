import { describe, expect, it } from 'vitest';
import { completeSession, currentPlan, initialRotation, preview, skipSession } from './rotation';

describe('rotation engine', () => {
  it('starts on Chest, Normal', () => {
    expect(currentPlan(initialRotation())).toEqual({ focus: 'Chest', type: 'Normal', cycleStep: 1 });
  });

  it('cycles each focus Normal, Normal, GVT, then resets', () => {
    let s = initialRotation();
    const chest: string[] = [];
    for (let i = 0; i < 20; i++) {
      const p = currentPlan(s);
      if (p.focus === 'Chest') chest.push(p.type);
      s = completeSession(s);
    }
    expect(chest).toEqual(['Normal', 'Normal', 'GVT', 'Normal']);
  });

  it('moves through foci in order and wraps', () => {
    const foci = preview(initialRotation(), 6).map((p) => p.focus);
    expect(foci).toEqual(['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'Chest']);
  });

  it('keeps a separate counter per focus', () => {
    let s = initialRotation();
    s = completeSession(s); // Chest 1
    s = skipSession(s); // Shoulder skipped
    expect(s.counters).toMatchObject({ Chest: 1, Shoulder: 0, Back: 0 });
  });

  it('a skip rolls forward with no gap and does not advance the counter', () => {
    let s = initialRotation();
    s = skipSession(s);
    expect(currentPlan(s)).toMatchObject({ focus: 'Shoulder', type: 'Normal' });
    expect(s.counters.Chest).toBe(0);
  });

  it('only completed sessions advance toward GVT', () => {
    let s = initialRotation();
    // Two full weeks where Chest is skipped the first time: Chest should reach GVT on its 3rd completion.
    s = skipSession(s);
    for (let i = 0; i < 4; i++) s = completeSession(s);
    expect(currentPlan(s)).toMatchObject({ focus: 'Chest', type: 'Normal', cycleStep: 1 });
    s = completeSession(s); // Chest 1
    for (let i = 0; i < 4; i++) s = completeSession(s);
    s = completeSession(s); // Chest 2
    for (let i = 0; i < 4; i++) s = completeSession(s);
    expect(currentPlan(s)).toMatchObject({ focus: 'Chest', type: 'GVT' });
  });

  it('handles a 4-session week cleanly (no focus starves)', () => {
    let s = initialRotation();
    const seen: Record<string, number> = {};
    for (let i = 0; i < 40; i++) {
      seen[currentPlan(s).focus] = (seen[currentPlan(s).focus] ?? 0) + 1;
      s = completeSession(s);
    }
    expect(Object.values(seen).every((n) => n === 8)).toBe(true);
  });

  it('does not mutate input state', () => {
    const s = initialRotation();
    const copy = JSON.parse(JSON.stringify(s));
    completeSession(s);
    skipSession(s);
    expect(s).toEqual(copy);
  });
});
