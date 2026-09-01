import { LinkedList } from "./LinkedList";

/**
 * Hash table with separate chaining.
 *
 * The server looks a player up by session ID on every single message, so this is
 * the hottest lookup in the program. Hashing converts the key straight into a
 * bucket index, making lookup O(1) on average regardless of how many players
 * there are, where scanning a list would be O(n).
 *
 * Collisions — two keys landing in the same bucket — are handled by chaining:
 * each bucket holds a LinkedList of entries, searched linearly. With a good hash
 * and a low load factor those chains stay about one entry long.
 */

interface Entry<V> { key: string; value: V; }

export class HashTable<V> {
  private buckets: Array<LinkedList<Entry<V>>>;
  private count = 0;
  /** Chains grow past ~0.75 entries per bucket, so the table doubles at that point. */
  private static readonly LOAD_FACTOR = 0.75;

  constructor(private capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => new LinkedList<Entry<V>>());
  }

  get size(): number { return this.count; }

  /**
   * djb2 hash. Each character is folded into a running total that is first
   * multiplied by 33, which spreads similar strings (like sequential session IDs)
   * across very different buckets instead of clustering them.
   * `>>> 0` keeps the result a positive 32-bit integer.
   */
  private hash(key: string): number {
    let h = 5381;
    for (let i = 0; i < key.length; i++) {
      h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
    }
    return h % this.capacity;
  }

  /** Insert or overwrite. O(1) average. */
  set(key: string, value: V): void {
    const bucket = this.buckets[this.hash(key)];
    const existing = bucket.find((e) => e.key === key);
    if (existing) { existing.value = value; return; }

    bucket.addFirst({ key, value });
    this.count++;
    if (this.count / this.capacity > HashTable.LOAD_FACTOR) this.resize();
  }

  /** O(1) average, O(n) if every key collided into one chain. */
  get(key: string): V | undefined {
    return this.buckets[this.hash(key)].find((e) => e.key === key)?.value;
  }

  has(key: string): boolean { return this.get(key) !== undefined; }

  delete(key: string): boolean {
    const removed = this.buckets[this.hash(key)].remove((e) => e.key === key);
    if (removed) this.count--;
    return removed;
  }

  keys(): string[] { return this.entries().map((e) => e.key); }
  values(): V[] { return this.entries().map((e) => e.value); }

  entries(): Array<Entry<V>> {
    const out: Array<Entry<V>> = [];
    for (const bucket of this.buckets) out.push(...bucket.toArray());
    return out;
  }

  /**
   * Double the bucket count and re-insert everything. Every key must be re-hashed
   * because the bucket index depends on the capacity. O(n), but rare enough that
   * the amortised cost of set() stays O(1).
   */
  private resize(): void {
    const all = this.entries();
    this.capacity *= 2;
    this.buckets = Array.from({ length: this.capacity }, () => new LinkedList<Entry<V>>());
    this.count = 0;
    for (const e of all) this.set(e.key, e.value);
  }

  /** Chain lengths — evidence for the write-up that the hash spreads keys evenly. */
  bucketLengths(): number[] { return this.buckets.map((b) => b.length); }
}
