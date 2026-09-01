import test from "node:test";
import assert from "node:assert/strict";
import { move, moveRecursive, moveBackwards, findByName, searchByPrefix, allPropertiesAlphabetical, nameIndexStats } from "./BoardGraph";
import { BOARD } from "../shared/board";

test("board ring: moving 40 squares returns you to where you started", () => {
  for (const from of [0, 7, 23, 39]) {
    assert.equal(move(from, 40).landedOn, from);
  }
});

test("board ring: Mayfair wraps round to GO with no modular arithmetic", () => {
  const result = move(39, 1);
  assert.equal(result.landedOn, 0);
  assert.equal(result.passedGo, true);
});

test("board ring: passing GO is detected from the path walked", () => {
  // 38 -> 39 -> 0 -> 1: GO is stepped through, not landed on
  const through = move(38, 3);
  assert.deepEqual(through.path, [39, 0, 1]);
  assert.equal(through.passedGo, true);
  assert.equal(through.landedOn, 1);

  // A move that never reaches GO
  const short = move(5, 3);
  assert.equal(short.passedGo, false);
  assert.deepEqual(short.path, [6, 7, 8]);
});

test("board ring: landing exactly ON GO still counts as passing it", () => {
  const exact = move(38, 2);
  assert.equal(exact.landedOn, 0);
  assert.equal(exact.passedGo, true);
});

test("board ring: the recursive walk agrees with the iterative one", () => {
  for (let from = 0; from < BOARD.length; from++) {
    for (const steps of [1, 2, 7, 12]) {
      const a = move(from, steps);
      const b = moveRecursive(from, steps);
      assert.equal(a.landedOn, b.landedOn, `from ${from} by ${steps}`);
      assert.equal(a.passedGo, b.passedGo, `passedGo from ${from} by ${steps}`);
      assert.deepEqual(a.path, b.path);
    }
  }
});

test("board ring: moving backwards works without prev pointers", () => {
  assert.equal(moveBackwards(10, 3), 7);   // the Chance "go back three" card
  assert.equal(moveBackwards(1, 3), 38);   // wraps backwards past GO
  assert.equal(moveBackwards(0, 1), 39);
});

test("BST index: finds properties by name, case-insensitively", () => {
  assert.equal(findByName("Mayfair")?.index, 39);
  assert.equal(findByName("mayfair")?.index, 39);
  assert.equal(findByName("OLD KENT ROAD")?.index, 1);
  assert.equal(findByName("Free Parking"), undefined); // not ownable, not indexed
  assert.equal(findByName("Nowhere Road"), undefined);
});

test("BST index: prefix search finds every Street beginning with 'bo'", () => {
  const names = searchByPrefix("bo").map((t) => t.name).sort();
  assert.deepEqual(names, ["Bond Street", "Bow Street"]);
});

test("BST index: in-order traversal is alphabetical and holds all 28 properties", () => {
  const all = allPropertiesAlphabetical();
  assert.equal(all.length, 28); // 22 streets + 4 stations + 2 utilities
  const names = all.map((t) => t.name.toLowerCase());
  assert.deepEqual(names, [...names].sort());
});

test("BST index: the tree is usefully shaped, not a degenerate list", () => {
  const { size, height } = nameIndexStats();
  assert.equal(size, 28);
  // A perfectly balanced tree of 28 nodes is 5 deep; a degenerate one is 28.
  assert.ok(height <= 10, `tree height ${height} suggests near-sorted insertion`);
});
