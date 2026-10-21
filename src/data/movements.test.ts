import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY, SEED_MOVEMENTS } from './movements';

describe('seed library', () => {
  it('has unique ids', () => {
    const ids = SEED_MOVEMENTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('default days reference real movements', () => {
    const ids = new Set(SEED_MOVEMENTS.map((m) => m.id));
    for (const list of Object.values(DEFAULT_DAY)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });
  it('flags every arm movement for the elbow', () => {
    expect(SEED_MOVEMENTS.filter((m) => m.focus === 'Arm').every((m) => m.flags.includes('elbow'))).toBe(true);
  });
});
