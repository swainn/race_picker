import { describe, expect, it } from 'vitest';
import { DUEL_CHARACTERS, pickTwoCharacters } from './duelCharacters';

describe('DUEL_CHARACTERS roster', () => {
  it('has unique ids and names', () => {
    const ids = DUEL_CHARACTERS.map((c) => c.id);
    const names = DUEL_CHARACTERS.map((c) => c.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every character has a super callout and color', () => {
    for (const c of DUEL_CHARACTERS) {
      expect(c.superCallout.length).toBeGreaterThan(0);
      expect(c.superColor).toMatch(/^#/);
    }
  });
});

describe('pickTwoCharacters', () => {
  it('never produces a mirror match', () => {
    for (let t = 0; t < 2000; t++) {
      const [a, b] = pickTwoCharacters();
      expect(a.id).not.toBe(b.id);
    }
  });

  it('cycles the whole roster before repeating (shuffle bag)', () => {
    // The bag is module-level and may sit mid-cycle from earlier tests, so
    // draw two full cycles' worth — that must contain at least one complete
    // cycle and therefore the entire roster.
    const seen = new Set<string>();
    const calls = DUEL_CHARACTERS.length; // 2 draws per call = 2 cycles
    for (let d = 0; d < calls; d++) {
      const [a, b] = pickTwoCharacters();
      seen.add(a.id);
      seen.add(b.id);
    }
    expect(seen.size).toBe(DUEL_CHARACTERS.length);
  });
});
