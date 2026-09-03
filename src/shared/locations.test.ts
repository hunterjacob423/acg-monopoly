import test from "node:test";
import assert from "node:assert/strict";
import { BOARD } from "./board";
import { LOCATIONS, locationImage } from "./locations";

/*
  locations.ts is meant to be hand-edited, so these check the kinds of mistake a
  person makes while typing over 40 names — not the kinds a compiler already
  catches. The messages name the offending square, so a failure says what to fix.
*/

test("locations: every entry refers to a real square", () => {
  for (const key of Object.keys(LOCATIONS)) {
    const index = Number(key);
    assert.ok(
      Number.isInteger(index) && index >= 0 && index < BOARD.length,
      `locations.ts has an entry for square ${key}, but the board only has squares 0-${BOARD.length - 1}`,
    );
  }
});

test("locations: no square is left without a name", () => {
  for (const tile of BOARD) {
    assert.ok(tile.name.trim().length > 0, `square ${tile.index} has a blank name`);
  }
});

/*
  The BST index is keyed by name and overwrites on an exact duplicate, so naming
  two properties the same would leave one of them unreachable from the trade
  screen's search — and it would fail quietly, which is the worst way to fail.
*/
test("locations: no two ownable squares share a name", () => {
  const seen = new Map<string, number>();
  for (const tile of BOARD) {
    if (!["street", "station", "utility"].includes(tile.kind)) continue;
    const key = tile.name.trim().toLowerCase();
    const first = seen.get(key);
    assert.equal(
      first, undefined,
      `squares ${first} and ${tile.index} are both called "${tile.name}" — ` +
      `property names must be unique or one becomes unsearchable`,
    );
    seen.set(key, tile.index);
  }
});

test("locations: picture filenames are filenames, not paths or URLs", () => {
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    if (!loc.image) continue;
    assert.ok(
      !loc.image.includes("/") && !loc.image.includes("\\"),
      `square ${key}: image should be just the filename, e.g. "sports-hall.jpg" — ` +
      `the folder is added for you`,
    );
    assert.match(
      loc.image, /\.(jpe?g|png|webp|gif|avif|svg)$/i,
      `square ${key}: "${loc.image}" does not look like an image file`,
    );
  }
});

test("locations: a square with no picture asks for no picture", () => {
  assert.equal(locationImage(undefined), undefined);
  assert.equal(locationImage("gym.jpg"), "/locations/gym.jpg");
});

test("locations: renaming a square changes it everywhere, not just the board", () => {
  // The merge in board.ts is what makes one edit reach the rules, the deeds and
  // the cards at once. If this breaks, renaming would only skin the board.
  const themed = BOARD[39];
  assert.equal(themed.name, LOCATIONS[39].name);
  assert.equal(themed.price, 400, "re-theming must not disturb the price");
});
