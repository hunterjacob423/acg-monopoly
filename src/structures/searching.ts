/**
 * Binary search over a sorted array.
 *
 * Used on the all-time leaderboard, which is stored sorted by player name.
 * Repeatedly halving the range gives O(log n) — 10 comparisons for 1000 players,
 * where a linear scan would average 500.
 *
 * The precondition is absolute: the array MUST already be sorted by the same
 * comparison, or the result is meaningless rather than merely slow.
 */

/** Index of the match, or -1. Iterative form. */
export function binarySearch<T>(
  sorted: readonly T[],
  target: T,
  compare: (a: T, b: T) => number,
): number {
  let low = 0;
  let high = sorted.length - 1;

  while (low <= high) {
    // Midpoint written this way rather than (low + high) / 2, which can overflow
    // in fixed-width integer languages. Habit worth keeping.
    const mid = low + Math.floor((high - low) / 2);
    const cmp = compare(sorted[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) low = mid + 1;   // target is in the upper half
    else high = mid - 1;          // target is in the lower half
  }
  return -1;
}

/**
 * The same search written recursively, to contrast with the loop above.
 * Each call discards half the range; the base case is an empty range (low > high).
 *
 * Same O(log n) comparisons, but O(log n) stack frames instead of O(1) memory —
 * the trade-off recursion always makes.
 */
export function binarySearchRecursive<T>(
  sorted: readonly T[],
  target: T,
  compare: (a: T, b: T) => number,
  low = 0,
  high = sorted.length - 1,
): number {
  if (low > high) return -1;                     // base case: nothing left to search
  const mid = low + Math.floor((high - low) / 2);
  const cmp = compare(sorted[mid], target);
  if (cmp === 0) return mid;                     // base case: found
  return cmp < 0
    ? binarySearchRecursive(sorted, target, compare, mid + 1, high)
    : binarySearchRecursive(sorted, target, compare, low, mid - 1);
}
