import { shuffle } from './array';

/**
 * A "shuffle bag": draws items in random order with no repeats until the pool
 * is exhausted, then reshuffles for the next cycle. Guarantees the first draw
 * of a new cycle differs from the last draw of the previous one, so two
 * consecutive draws are never the same item (when the pool has 2+ items).
 *
 * Use for cosmetic variety (stages, characters) where plain `Math.random`
 * repeats too often — never for fairness-critical picks.
 */
export function createShuffleBag<T>(items: readonly T[]): () => T {
  let bag: T[] = [];
  let last: T | undefined;

  return () => {
    if (bag.length === 0) {
      bag = shuffle(items);
      // Draws pop from the end; if the next draw would repeat the previous
      // cycle's final item, swap it elsewhere in the bag.
      if (bag.length > 1 && bag[bag.length - 1] === last) {
        const j = Math.floor(Math.random() * (bag.length - 1));
        [bag[bag.length - 1], bag[j]] = [bag[j], bag[bag.length - 1]];
      }
    }
    last = bag.pop() as T;
    return last;
  };
}
