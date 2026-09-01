/**
 * Singly linked list, and a circular variant used to model the Monopoly board.
 *
 * A linked list stores each item in a node that holds a pointer to the next node,
 * rather than in one contiguous block like an array. Inserting at the head is
 * therefore O(1) with no shifting, but reaching the nth item costs O(n) because
 * the only way there is to follow the pointers.
 */

export class ListNode<T> {
  next: ListNode<T> | null = null;
  constructor(public value: T) {}
}

export class LinkedList<T> {
  private head: ListNode<T> | null = null;
  private count = 0;

  get length(): number { return this.count; }

  /** Insert at the front. O(1) — no existing nodes are touched. */
  addFirst(value: T): void {
    const node = new ListNode(value);
    node.next = this.head;
    this.head = node;
    this.count++;
  }

  /** Insert at the end. O(n), because the tail must be found by traversal. */
  addLast(value: T): void {
    const node = new ListNode(value);
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) current = current.next;
      current.next = node;
    }
    this.count++;
  }

  /** First value satisfying the predicate, or undefined. O(n). */
  find(predicate: (value: T) => boolean): T | undefined {
    let current = this.head;
    while (current) {
      if (predicate(current.value)) return current.value;
      current = current.next;
    }
    return undefined;
  }

  /**
   * Remove the first matching node by re-pointing its predecessor past it.
   * O(n) to find, O(1) to unlink. Returns whether anything was removed.
   */
  remove(predicate: (value: T) => boolean): boolean {
    if (!this.head) return false;
    if (predicate(this.head.value)) {
      this.head = this.head.next;
      this.count--;
      return true;
    }
    let current = this.head;
    while (current.next) {
      if (predicate(current.next.value)) {
        current.next = current.next.next;
        this.count--;
        return true;
      }
      current = current.next;
    }
    return false;
  }

  toArray(): T[] {
    const out: T[] = [];
    let current = this.head;
    while (current) { out.push(current.value); current = current.next; }
    return out;
  }
}

/**
 * Circular linked list: the last node points back to the first, so following
 * `next` forever walks the ring endlessly. This is exactly how a Monopoly board
 * behaves — leaving Mayfair (39) brings you to GO (0) — so movement needs no
 * wrap-around arithmetic, and "did I pass GO?" is just "did I step onto index 0".
 */
export class CircularLinkedList<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private count = 0;

  get length(): number { return this.count; }

  /** Append, keeping the ring closed. O(1) — the tail is cached. */
  add(value: T): ListNode<T> {
    const node = new ListNode(value);
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail!.next = node;
      this.tail = node;
    }
    node.next = this.head; // close the ring
    this.count++;
    return node;
  }

  /** The node at `index` steps from the start. O(n). */
  nodeAt(index: number): ListNode<T> | null {
    if (!this.head || this.count === 0) return null;
    let current = this.head;
    for (let i = 0; i < index % this.count; i++) current = current.next!;
    return current;
  }

  /**
   * Walk `steps` nodes forward from `from`, calling `onStep` for each node landed
   * on. Iterative: a recursive version would be one frame per step and is written
   * separately in Board.ts to demonstrate the recursive form.
   */
  advance(from: ListNode<T>, steps: number, onStep?: (node: ListNode<T>) => void): ListNode<T> {
    let current = from;
    for (let i = 0; i < steps; i++) {
      current = current.next!;
      onStep?.(current);
    }
    return current;
  }

  toArray(): T[] {
    const out: T[] = [];
    let current = this.head;
    for (let i = 0; i < this.count && current; i++) { out.push(current.value); current = current.next; }
    return out;
  }
}
