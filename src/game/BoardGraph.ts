import { CircularLinkedList, type ListNode } from "../structures/LinkedList";
import { BinarySearchTree } from "../structures/BinarySearchTree";
import { BOARD, type Tile } from "../shared/board";

/**
 * The board as a circular linked list, plus a BST index of property names.
 *
 * Modelling the board as a ring of nodes rather than an array with `% 40`
 * arithmetic matches the real object: each square physically leads to the next,
 * and Mayfair leads back to GO. Movement becomes "follow next, this many times",
 * and passing GO is simply "one of the squares I stepped through was GO" — no
 * comparison of before-and-after indices, which is where the awkward edge cases
 * live (landing exactly on GO, or a card sending you backwards past it).
 */

const ring = new CircularLinkedList<Tile>();
const nodes: Array<ListNode<Tile>> = [];
for (const tile of BOARD) nodes.push(ring.add(tile));

/** Property names, for lookup and alphabetical listing without sorting. */
const nameIndex = new BinarySearchTree<Tile>();
for (const tile of BOARD) {
  if (tile.kind === "street" || tile.kind === "station" || tile.kind === "utility") {
    nameIndex.insert(tile.name, tile);
  }
}

export interface MoveResult {
  /** Board index landed on. */
  landedOn: number;
  /** True if GO was stepped through or onto during the move. */
  passedGo: boolean;
  /** Every square stepped through, in order — useful for animating a move. */
  path: number[];
}

/**
 * Move `steps` squares forward from `from`, following `next` pointers.
 * O(steps), and steps is at most 12 from two dice.
 */
export function move(from: number, steps: number): MoveResult {
  const path: number[] = [];
  let passedGo = false;

  ring.advance(nodes[from], steps, (node) => {
    path.push(node.value.index);
    if (node.value.index === 0) passedGo = true;
  });

  return { landedOn: path.length ? path[path.length - 1] : from, passedGo, path };
}

/**
 * The same walk expressed recursively: move one square, then move the rest.
 *
 * Base case is `steps === 0` — you have arrived. Each call handles exactly one
 * step and hands the remainder to the next call, so the recursion depth equals
 * the number of squares moved (at most 12 here, so no risk of a stack overflow).
 *
 * Functionally identical to `move()`; kept alongside it so the iterative and
 * recursive solutions to the same problem can be compared directly.
 */
export function moveRecursive(from: number, steps: number, path: number[] = []): MoveResult {
  if (steps === 0) {
    return {
      landedOn: path.length ? path[path.length - 1] : from,
      passedGo: path.includes(0),
      path,
    };
  }
  const next = nodes[from].next!.value.index;
  path.push(next);
  return moveRecursive(next, steps - 1, path);
}

/** Squares moved backwards, e.g. the "go back three spaces" Chance card. */
export function moveBackwards(from: number, steps: number): number {
  // Walking forwards (length - steps) is equivalent to walking backwards on a
  // ring, and avoids needing `prev` pointers on every node.
  return move(from, BOARD.length - (steps % BOARD.length)).landedOn;
}

/** Look up a property by name. O(log n) through the BST. */
export function findByName(name: string): Tile | undefined {
  return nameIndex.search(name);
}

/** Every property whose name starts with the prefix — a trade screen type-ahead. */
export function searchByPrefix(prefix: string): Tile[] {
  return nameIndex.startingWith(prefix);
}

/** All properties in alphabetical order, straight from an in-order traversal. */
export function allPropertiesAlphabetical(): Tile[] {
  return nameIndex.inOrder().map((e) => e.value);
}

/** Exposed for the write-up: how balanced the name tree actually is. */
export const nameIndexStats = () => ({ size: nameIndex.size, height: nameIndex.height() });
