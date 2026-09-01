/**
 * Sorting algorithms, written out rather than calling Array.prototype.sort, so the
 * behaviour and cost of each is visible and can be compared.
 *
 * Both are O(n^2) in the worst case, which is fine at the sizes this game uses:
 * at most 6 players and at most 28 properties per player.
 */

/** How many comparisons and swaps a run took — used to compare the two algorithms. */
export interface SortStats { comparisons: number; swaps: number; }

/**
 * Bubble sort. Repeatedly walks the list swapping neighbours that are out of
 * order, so after each pass the largest remaining item has "bubbled" to the end.
 *
 * Used for the end-of-game rankings: at most 6 players, run once, where the
 * O(n^2) cost is irrelevant and the simplicity is worth more than speed.
 *
 * Best case O(n) thanks to the early exit below, worst and average O(n^2).
 * It is stable: equal items keep their original relative order.
 */
export function bubbleSort<T>(
  items: T[],
  compare: (a: T, b: T) => number,
  stats?: SortStats,
): T[] {
  const out = [...items]; // sort a copy: mutating the caller's array causes surprises
  for (let pass = 0; pass < out.length - 1; pass++) {
    let swapped = false;
    // Everything past this point is already in its final position.
    for (let i = 0; i < out.length - 1 - pass; i++) {
      if (stats) stats.comparisons++;
      if (compare(out[i], out[i + 1]) > 0) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
        if (stats) stats.swaps++;
        swapped = true;
      }
    }
    // A pass with no swaps means the list is sorted; stop early.
    if (!swapped) break;
  }
  return out;
}

/**
 * Insertion sort. Takes each item in turn and shuffles it back into its place
 * among the items already sorted to its left, like sorting a hand of cards.
 *
 * Used for a player's property portfolio. That list is built one property at a
 * time and is therefore almost always nearly sorted already, which is exactly the
 * case insertion sort is good at: O(n) on nearly-sorted input because the inner
 * loop barely runs. Worst case is still O(n^2).
 */
export function insertionSort<T>(
  items: T[],
  compare: (a: T, b: T) => number,
  stats?: SortStats,
): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i++) {
    const current = out[i];
    let j = i - 1;
    // Slide larger items right until the gap for `current` is found.
    while (j >= 0) {
      if (stats) stats.comparisons++;
      if (compare(out[j], current) <= 0) break;
      out[j + 1] = out[j];
      if (stats) stats.swaps++;
      j--;
    }
    out[j + 1] = current;
  }
  return out;
}
