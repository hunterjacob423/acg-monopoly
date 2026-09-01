/**
 * Last-in, first-out stack.
 *
 * Used for the card discard pile (the most recently used card sits on top) and
 * for the event log, which is displayed newest-first — exactly pop order.
 * Every operation is O(1) because only the top is ever touched.
 */
export class Stack<T> {
  private items: T[] = [];

  /** Add to the top. O(1). */
  push(item: T): void { this.items.push(item); }

  /** Remove and return the top, or undefined when empty. O(1). */
  pop(): T | undefined { return this.items.pop(); }

  /** Look at the top without removing it. O(1). */
  peek(): T | undefined { return this.items[this.items.length - 1]; }

  get size(): number { return this.items.length; }
  isEmpty(): boolean { return this.items.length === 0; }

  /** Top-first, which is the order the log is displayed in. O(n). */
  toArray(): T[] { return [...this.items].reverse(); }

  clear(): void { this.items = []; }
}
