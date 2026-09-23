import { describe, expect, it } from 'vitest';
import { MODE_LIST, MODE_REGISTRY } from './registry';

const nameOf = (label: string) => label.replace(/^[^\p{L}]+/u, '');

describe('MODE_LIST', () => {
  it('lists every registered mode exactly once', () => {
    expect(MODE_LIST).toHaveLength(Object.keys(MODE_REGISTRY).length);
    expect(new Set(MODE_LIST.map((m) => m.value)).size).toBe(MODE_LIST.length);
  });

  it('is in alphabetical order by mode name, ignoring the leading emoji', () => {
    const names = MODE_LIST.map((m) => nameOf(m.label));
    const sorted = [...names].sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));
    expect(names).toEqual(sorted);
  });

  it('keeps each label pointing at its registry entry', () => {
    for (const mode of MODE_LIST) {
      expect(mode.label).toBe(MODE_REGISTRY[mode.value].label);
    }
  });
});
