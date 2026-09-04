import { describe, expect, it } from 'vitest';
import { createShuffleBag } from './shuffleBag';

describe('createShuffleBag', () => {
  it('draws every item exactly once per cycle', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const draw = createShuffleBag(items);
    for (let cycle = 0; cycle < 20; cycle++) {
      const drawn = Array.from({ length: items.length }, draw);
      expect([...drawn].sort()).toEqual([...items].sort());
    }
  });

  it('never repeats an item on consecutive draws', () => {
    const draw = createShuffleBag([1, 2, 3]);
    let prev = draw();
    for (let i = 0; i < 3000; i++) {
      const next = draw();
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('handles a single-item pool', () => {
    const draw = createShuffleBag(['only']);
    expect(draw()).toBe('only');
    expect(draw()).toBe('only');
  });

  it('does not mutate the source array', () => {
    const items = [1, 2, 3, 4];
    const copy = [...items];
    const draw = createShuffleBag(items);
    for (let i = 0; i < 10; i++) draw();
    expect(items).toEqual(copy);
  });
});
