import { describe, expect, it } from 'vitest';
import { STAGE_IDS, type StageId } from './duelEngine';
import { trackFor } from './duelAudio';
import { DUEL_THEMES, DUEL_THEME_IDS } from './duelThemes';

describe('DUEL_THEMES registry', () => {
  it('covers every theme id with a matching entry', () => {
    expect(Object.keys(DUEL_THEMES).sort()).toEqual([...DUEL_THEME_IDS].sort());
    for (const id of DUEL_THEME_IDS) {
      expect(DUEL_THEMES[id].id).toBe(id);
      expect(DUEL_THEMES[id].label.length).toBeGreaterThan(0);
    }
  });

  it('every theme draws its stages from the real stage list', () => {
    const known = new Set<StageId>(STAGE_IDS);
    for (const id of DUEL_THEME_IDS) {
      const { stages } = DUEL_THEMES[id];
      expect(stages.length).toBeGreaterThan(0);
      for (const s of stages) expect(known.has(s), `${id}: unknown stage ${s}`).toBe(true);
      expect(new Set(stages).size, `${id}: duplicate stages`).toBe(stages.length);
    }
  });

  it('every theme supplies announcer, hit-word and dialog text', () => {
    for (const id of DUEL_THEME_IDS) {
      const t = DUEL_THEMES[id];
      for (const s of [t.announce.round, t.announce.fight, t.announce.ko]) {
        expect(s.length).toBeGreaterThan(0);
      }
      expect(t.hitWords.length).toBeGreaterThan(0);
      for (const s of [t.dialog.headline, t.dialog.finalsHeadline, t.dialog.nextLabel, t.dialog.byIcon]) {
        expect(s.length).toBeGreaterThan(0);
      }
    }
  });

  it('names a callout for both callout-carrying moves, for every character', () => {
    for (const id of DUEL_THEME_IDS) {
      const t = DUEL_THEMES[id];
      for (const c of t.roster) {
        for (const m of ['hadoken', 'shoryuken'] as const) {
          expect(t.moveCallout(m, c), `${id}/${c.id}/${m}`).toBeTruthy();
        }
      }
      // Basic attacks stay silent in every theme.
      expect(t.moveCallout('punch', t.roster[0])).toBeUndefined();
    }
  });

  it('cycles each stage bag through its own list without repeats', () => {
    for (const id of DUEL_THEME_IDS) {
      const t = DUEL_THEMES[id];
      const drawn = t.stages.map(() => t.drawStage());
      expect(new Set(drawn).size, `${id}: stage bag skipped stages`).toBe(t.stages.length);
    }
  });

  it('plays a well-formed track for every stage in every theme', () => {
    for (const id of DUEL_THEME_IDS) {
      for (const stage of DUEL_THEMES[id].stages) {
        const t = trackFor(stage, id);
        expect(t, `${id}/${stage}: no track`).toBeDefined();
        expect(t.lead.length, `${id}/${stage}: lead length`).toBe(16);
        expect(t.bass.length, `${id}/${stage}: bass length`).toBe(16);
        expect(t.bpm).toBeGreaterThan(40);
        expect(t.bpm).toBeLessThan(260);
        for (const n of [...t.lead, ...t.bass]) {
          // 0 is a rest; anything else must be a sane MIDI pitch.
          if (n !== 0) {
            expect(n, `${id}/${stage}: midi ${n} out of range`).toBeGreaterThanOrEqual(24);
            expect(n, `${id}/${stage}: midi ${n} out of range`).toBeLessThanOrEqual(108);
          }
        }
      }
    }
  });

  it('gives the galaxy roster its own music on every one of its stages', () => {
    for (const stage of DUEL_THEMES.galaxy.stages) {
      expect(
        trackFor(stage, 'galaxy'),
        `${stage}: galaxy falls back to the street track`
      ).not.toBe(trackFor(stage, 'street'));
    }
  });

  it('keeps theme bags independent of each other', () => {
    // Drawing heavily from one theme must not disturb another's cycle.
    const galaxy = DUEL_THEMES.galaxy;
    for (let i = 0; i < 37; i++) DUEL_THEMES.street.drawCharacter();
    const seen = new Set(galaxy.roster.map(() => galaxy.drawCharacter().id));
    expect(seen.size).toBe(galaxy.roster.length);
  });
});
