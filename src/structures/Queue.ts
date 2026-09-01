/**
 * First-in, first-out queue, and a circular variant for turn order.
 *
 * The card draw pile is a queue because Monopoly puts a used card at the BOTTOM
 * of the pile — enqueue at the back, dequeue from the front.
 */
export class Queue<T> {
  private items: T[] = [];
  /** Index of the front item. Moving this instead of shifting keeps dequeue O(1). */
  private head = 0;

  /** Add to the back. O(1). */
  enqueue(item: T): void { this.items.push(item); }

  /**
   * Remove and return the front. O(1) amortised: rather than shifting every
   * element left (which would be O(n)), the head index moves forward and the
   * dead prefix is discarded once it grows past half the array.
   */
  dequeue(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head];
    this.head++;
    if (this.head > 32 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }

  /** Front item without removing it. O(1). */
  peek(): T | undefined { return this.items[this.head]; }

  get size(): number { return this.items.length - this.head; }
  isEmpty(): boolean { return this.size === 0; }
  toArray(): T[] { return this.items.slice(this.head); }
}

/**
 * Circular queue for turn order: the player whose turn ends is dequeued from the
 * front and immediately enqueued at the back, so the ring repeats forever without
 * needing an index that wraps. Skipping bankrupt players is then just "dequeue
 * until an active player reaches the front".
 */
export class CircularQueue<T> {
  private queue = new Queue<T>();

  constructor(items: T[] = []) { for (const i of items) this.queue.enqueue(i); }

  get size(): number { return this.queue.size; }
  /** Whose turn it is now. O(1). */
  current(): T | undefined { return this.queue.peek(); }

  /** End the current turn: front goes to the back. O(1). Returns the new front. */
  rotate(): T | undefined {
    const item = this.queue.dequeue();
    if (item !== undefined) this.queue.enqueue(item);
    return this.queue.peek();
  }

  /** Take someone out of the rotation permanently (bankruptcy). O(n). */
  remove(match: (item: T) => boolean): void {
    const kept = this.queue.toArray().filter((i) => !match(i));
    this.queue = new Queue<T>();
    for (const i of kept) this.queue.enqueue(i);
  }

  toArray(): T[] { return this.queue.toArray(); }
}
