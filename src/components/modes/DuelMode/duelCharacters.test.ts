import { describe, expect, it } from 'vitest';
import { DUEL_THEMES, DUEL_THEME_IDS, pickTwoFrom } from './duelThemes';

// Every roster theme must satisfy the same invariants, so the suite runs once
// per theme rather than hardcoding the default cast.
describe.each(DUEL_THEME_IDS)('%s roster', (themeId) => {
  const theme = DUEL_THEMES[themeId];

  it('has unique ids and names', () => {
    const ids = theme.roster.map((c) => c.id);
    const names = theme.roster.map((c) => c.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has at least two characters (required for mirror-free duels)', () => {
    expect(theme.roster.length).toBeGreaterThanOrEqual(2);
  });

  it('every character has a super callout and color', () => {
    for (const c of theme.roster) {
      expect(c.superCallout.length).toBeGreaterThan(0);
      expect(c.superColor).toMatch(/^#/);
    }
  });

  it('every armed character also declares a weapon color', () => {
    for (const c of theme.roster) {
      if (c.visual.weapon) expect(c.visual.weaponColor, `${c.id}`).toMatch(/^#/);
    }
  });

  it('never produces a mirror match', () => {
    for (let t = 0; t < 2000; t++) {
      const [a, b] = pickTwoFrom(theme);
      expect(a.id).not.toBe(b.id);
    }
  });

  it('cycles the whole roster before repeating (shuffle bag)', () => {
    // The bag is module-level and may sit mid-cycle from earlier tests, so
    // draw two full cycles' worth — that must contain at least one complete
    // cycle and therefore the entire roster.
    const seen = new Set<string>();
    for (let d = 0; d < theme.roster.length; d++) {
      const [a, b] = pickTwoFrom(theme); // 2 draws per call = 2 cycles
      seen.add(a.id);
      seen.add(b.id);
    }
    expect(seen.size).toBe(theme.roster.length);
  });
});
