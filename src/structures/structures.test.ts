import test from "node:test";
import assert from "node:assert/strict";
import { LinkedList, CircularLinkedList } from "./LinkedList";
import { Stack } from "./Stack";
import { Queue, CircularQueue } from "./Queue";
import { BinarySearchTree } from "./BinarySearchTree";
import { HashTable } from "./HashTable";
import { bubbleSort, insertionSort, type SortStats } from "./sorting";
import { binarySearch, binarySearchRecursive } from "./searching";

test("LinkedList: adds at both ends and keeps order", () => {
  const list = new LinkedList<number>();
  list.addLast(2); list.addLast(3); list.addFirst(1);
  assert.deepEqual(list.toArray(), [1, 2, 3]);
  assert.equal(list.length, 3);
});

test("LinkedList: removes head, middle and missing values", () => {
  const list = new LinkedList<string>();
  ["a", "b", "c"].forEach((v) => list.addLast(v));
  assert.equal(list.remove((v) => v === "b"), true);
  assert.deepEqual(list.toArray(), ["a", "c"]);
  assert.equal(list.remove((v) => v === "a"), true);
  assert.deepEqual(list.toArray(), ["c"]);
  assert.equal(list.remove((v) => v === "zz"), false);
  assert.equal(list.length, 1);
});

test("CircularLinkedList: the ring closes back to the start", () => {
  const ring = new CircularLinkedList<number>();
  const first = ring.add(0);
  for (let i = 1; i < 40; i++) ring.add(i);
  assert.equal(ring.length, 40);
  // 40 steps from GO must land back on GO
  assert.equal(ring.advance(first, 40).value, 0);
  // Mayfair (39) + 1 wraps to GO, with no modular arithmetic anywhere
  assert.equal(ring.nodeAt(39)!.next!.value, 0);
});

test("CircularLinkedList: advance reports every tile passed through", () => {
  const ring = new CircularLinkedList<number>();
  const start = ring.add(0);
  for (let i = 1; i < 40; i++) ring.add(i);
  const visited: number[] = [];
  const landed = ring.advance(ring.nodeAt(38)!, 4, (n) => visited.push(n.value));
  assert.deepEqual(visited, [39, 0, 1, 2]); // passing GO is visible in the path
  assert.equal(landed.value, 2);
  assert.equal(start.value, 0);
});

test("Stack: last in, first out", () => {
  const s = new Stack<string>();
  assert.equal(s.isEmpty(), true);
  s.push("first"); s.push("second"); s.push("third");
  assert.equal(s.peek(), "third");
  assert.equal(s.pop(), "third");
  assert.equal(s.pop(), "second");
  assert.equal(s.size, 1);
  assert.deepEqual(new Stack<number>().pop(), undefined);
});

test("Stack: toArray gives newest first, as the log displays it", () => {
  const s = new Stack<string>();
  ["oldest", "middle", "newest"].forEach((v) => s.push(v));
  assert.deepEqual(s.toArray(), ["newest", "middle", "oldest"]);
});

test("Queue: first in, first out", () => {
  const q = new Queue<number>();
  q.enqueue(1); q.enqueue(2); q.enqueue(3);
  assert.equal(q.peek(), 1);
  assert.equal(q.dequeue(), 1);
  assert.equal(q.dequeue(), 2);
  assert.equal(q.size, 1);
  q.dequeue();
  assert.equal(q.dequeue(), undefined);
});

test("Queue: survives heavy churn without leaking the dead prefix", () => {
  const q = new Queue<number>();
  for (let i = 0; i < 500; i++) q.enqueue(i);
  for (let i = 0; i < 400; i++) assert.equal(q.dequeue(), i);
  assert.equal(q.size, 100);
  assert.equal(q.peek(), 400);
});

test("CircularQueue: turn order rotates and repeats", () => {
  const turns = new CircularQueue(["alice", "bob", "carol"]);
  assert.equal(turns.current(), "alice");
  assert.equal(turns.rotate(), "bob");
  assert.equal(turns.rotate(), "carol");
  assert.equal(turns.rotate(), "alice"); // full cycle
  assert.deepEqual(turns.toArray(), ["alice", "bob", "carol"]);
});

test("CircularQueue: a bankrupt player leaves the rotation", () => {
  const turns = new CircularQueue(["alice", "bob", "carol"]);
  turns.remove((p) => p === "bob");
  assert.equal(turns.size, 2);
  assert.equal(turns.current(), "alice");
  assert.equal(turns.rotate(), "carol");
  assert.equal(turns.rotate(), "alice");
});

test("BST: stores, finds, and reports missing keys", () => {
  const tree = new BinarySearchTree<number>();
  tree.insert("Mayfair", 400);
  tree.insert("Old Kent Road", 60);
  tree.insert("Bow Street", 180);
  assert.equal(tree.size, 3);
  assert.equal(tree.search("mayfair"), 400);      // lookup is case-insensitive
  assert.equal(tree.search("Bow Street"), 180);
  assert.equal(tree.search("Nowhere Lane"), undefined);
});

test("BST: in-order traversal comes out alphabetical with no sorting step", () => {
  const tree = new BinarySearchTree<number>();
  ["Vine Street", "Angel Islington", "Mayfair", "Bow Street"].forEach((n, i) => tree.insert(n, i));
  assert.deepEqual(tree.inOrder().map((e) => e.key),
    ["angel islington", "bow street", "mayfair", "vine street"]);
});

test("BST: duplicate key overwrites rather than growing the tree", () => {
  const tree = new BinarySearchTree<number>();
  tree.insert("Strand", 220);
  tree.insert("Strand", 999);
  assert.equal(tree.size, 1);
  assert.equal(tree.search("Strand"), 999);
});

test("BST: prefix search backs a type-ahead", () => {
  const tree = new BinarySearchTree<string>();
  ["Bow Street", "Bond Street", "Mayfair"].forEach((n) => tree.insert(n, n));
  assert.deepEqual(tree.startingWith("bo").sort(), ["Bond Street", "Bow Street"]);
});

test("BST: sorted insertion degenerates to a list, proving the worst case", () => {
  const balanced = new BinarySearchTree<number>();
  ["m", "f", "t", "c", "h", "q", "z"].forEach((k, i) => balanced.insert(k, i));
  const degenerate = new BinarySearchTree<number>();
  ["c", "f", "h", "m", "q", "t", "z"].forEach((k, i) => degenerate.insert(k, i));
  assert.equal(balanced.height(), 3);
  assert.equal(degenerate.height(), 7); // one node per level: effectively a linked list
});

test("HashTable: set, get, overwrite and delete", () => {
  const table = new HashTable<number>();
  table.set("abc", 1);
  table.set("def", 2);
  assert.equal(table.get("abc"), 1);
  table.set("abc", 99);
  assert.equal(table.get("abc"), 99);
  assert.equal(table.size, 2);
  assert.equal(table.delete("abc"), true);
  assert.equal(table.get("abc"), undefined);
  assert.equal(table.delete("abc"), false);
});

test("HashTable: resizes and keeps every entry findable", () => {
  const table = new HashTable<number>(4);
  for (let i = 0; i < 200; i++) table.set(`session-${i}`, i);
  assert.equal(table.size, 200);
  for (let i = 0; i < 200; i++) assert.equal(table.get(`session-${i}`), i);
});

test("HashTable: djb2 spreads keys instead of clustering them", () => {
  const table = new HashTable<number>(16);
  const keys = 100;
  for (let i = 0; i < keys; i++) table.set(`session-${i}`, i);

  const lengths = table.bucketLengths();
  const used = lengths.filter((l) => l > 0).length;

  // The table has resized to 256 buckets by now, so the ceiling is `keys`, not
  // the bucket count. For 100 keys in 256 buckets a uniform hash is expected to
  // occupy 256 * (1 - (255/256)^100) ~= 83 distinct buckets; anything close to
  // that means collisions are rare. A hash that clustered would sit far below.
  assert.ok(used >= 75, `only ${used} distinct buckets for ${keys} keys`);
  assert.ok(Math.max(...lengths) <= 4, `longest chain was ${Math.max(...lengths)}`);
});

const byNumber = (a: number, b: number) => a - b;

test("bubbleSort: sorts, and leaves the input untouched", () => {
  const input = [5, 3, 8, 1, 9, 2];
  assert.deepEqual(bubbleSort(input, byNumber), [1, 2, 3, 5, 8, 9]);
  assert.deepEqual(input, [5, 3, 8, 1, 9, 2]);
});

test("bubbleSort: handles empty, single and already-sorted input", () => {
  assert.deepEqual(bubbleSort([], byNumber), []);
  assert.deepEqual(bubbleSort([7], byNumber), [7]);
  const stats: SortStats = { comparisons: 0, swaps: 0 };
  bubbleSort([1, 2, 3, 4, 5], byNumber, stats);
  assert.equal(stats.swaps, 0);
  assert.equal(stats.comparisons, 4); // one pass, then the early exit fires
});

test("insertionSort: sorts, and beats bubbleSort on nearly-sorted data", () => {
  const nearly = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  assert.deepEqual(insertionSort(nearly, byNumber), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const a: SortStats = { comparisons: 0, swaps: 0 };
  const b: SortStats = { comparisons: 0, swaps: 0 };
  insertionSort(nearly, byNumber, a);
  bubbleSort(nearly, byNumber, b);
  assert.ok(a.comparisons < b.comparisons,
    `insertion ${a.comparisons} should beat bubble ${b.comparisons}`);
});

test("both sorts agree with each other on random data", () => {
  for (let run = 0; run < 50; run++) {
    const data = Array.from({ length: 30 }, () => Math.floor(Math.random() * 100));
    assert.deepEqual(bubbleSort(data, byNumber), insertionSort(data, byNumber));
  }
});

test("binarySearch: finds every element and rejects absent ones", () => {
  const sorted = [1, 3, 5, 7, 9, 11, 13];
  sorted.forEach((v, i) => assert.equal(binarySearch(sorted, v, byNumber), i));
  assert.equal(binarySearch(sorted, 4, byNumber), -1);
  assert.equal(binarySearch(sorted, 0, byNumber), -1);   // below the range
  assert.equal(binarySearch(sorted, 99, byNumber), -1);  // above the range
  assert.equal(binarySearch([], 1, byNumber), -1);
});

test("binarySearch: the recursive form agrees with the iterative one", () => {
  const sorted = Array.from({ length: 1000 }, (_, i) => i * 3);
  for (const target of [0, 3, 1497, 2997, 4, 9999]) {
    assert.equal(
      binarySearch(sorted, target, byNumber),
      binarySearchRecursive(sorted, target, byNumber),
    );
  }
});
