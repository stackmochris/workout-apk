import { describe, expect, it } from 'vitest';
import { offerSheetExport } from './finishExport';

describe('offerSheetExport', () => {
  it('asks after each completed workout and not again for that session', () => {
    const seen = new Set<string>();
    expect(offerSheetExport(seen, { id: 'a', status: 'completed' })).toBe(true);
    expect(offerSheetExport(seen, { id: 'a', status: 'completed' })).toBe(false);
    expect(offerSheetExport(seen, { id: 'b', status: 'completed' })).toBe(true);
  });

  it('does not ask after a skip, and a skip does not use up a later finish', () => {
    const seen = new Set<string>();
    expect(offerSheetExport(seen, { id: 'skip', status: 'skipped' })).toBe(false);
    expect(offerSheetExport(seen, { id: 'skip', status: 'completed' })).toBe(true);
  });
});
