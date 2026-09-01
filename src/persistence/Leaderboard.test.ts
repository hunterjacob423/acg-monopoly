import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Leaderboard, type MatchResult } from "./Leaderboard";

/** A throwaway data directory per test, so tests never touch the real files. */
function tempBoard(): { board: Leaderboard; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monopoly-test-"));
  return { board: new Leaderboard(dir), dir };
}

const match = (winner: string, standings: Array<[string, number]>): MatchResult => ({
  playedAt: new Date().toISOString(),
  roomCode: "TEST1",
  winner,
  standings: standings.map(([name, netWorth]) => ({ name, netWorth })),
});

test("Leaderboard: a missing file is a normal first run, not an error", () => {
  const { board, dir } = tempBoard();
  assert.equal(board.size, 0);
  assert.deepEqual(board.top(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: writes to disk and reads back", () => {
  const { board, dir } = tempBoard();
  board.recordMatch(match("Alice", [["Alice", 4200], ["Bob", 1300]]));

  assert.ok(fs.existsSync(path.join(dir, "leaderboard.json")));
  assert.ok(fs.existsSync(path.join(dir, "matches.json")));

  const reloaded = new Leaderboard(dir);
  assert.equal(reloaded.size, 2);
  assert.equal(reloaded.find("Alice")?.wins, 1);
  assert.equal(reloaded.find("Bob")?.wins, 0);
  assert.equal(reloaded.find("Alice")?.bestNetWorth, 4200);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: accumulates across several games", () => {
  const { board, dir } = tempBoard();
  board.recordMatch(match("Alice", [["Alice", 4200], ["Bob", 1300]]));
  board.recordMatch(match("Bob", [["Bob", 5000], ["Alice", 900]]));
  board.recordMatch(match("Alice", [["Alice", 3000], ["Bob", 2000]]));

  const alice = board.find("Alice")!;
  assert.equal(alice.gamesPlayed, 3);
  assert.equal(alice.wins, 2);
  assert.equal(alice.bestNetWorth, 4200); // kept the best, not the latest
  assert.equal(board.find("Bob")?.wins, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: stays sorted by name so binary search stays valid", () => {
  const { board, dir } = tempBoard();
  for (const n of ["Zara", "Alice", "Priya", "Bob", "Marcus"]) {
    board.recordMatch(match(n, [[n, 1000]]));
  }
  // Every name must still be findable by binary search after the inserts.
  for (const n of ["Zara", "Alice", "Priya", "Bob", "Marcus"]) {
    assert.equal(board.find(n)?.name, n, `could not find ${n}`);
  }
  assert.equal(board.find("Nobody"), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: ranks by wins, then best net worth", () => {
  const { board, dir } = tempBoard();
  board.recordMatch(match("Alice", [["Alice", 4000], ["Bob", 100], ["Cara", 100]]));
  board.recordMatch(match("Alice", [["Alice", 4000], ["Bob", 100], ["Cara", 100]]));
  board.recordMatch(match("Bob", [["Bob", 9000], ["Cara", 100]]));

  const top = board.top();
  assert.equal(top[0].name, "Alice"); // 2 wins
  assert.equal(top[1].name, "Bob");   // 1 win
  assert.equal(top[2].name, "Cara");  // 0 wins
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: a corrupt file is survived, not fatal", () => {
  const { board, dir } = tempBoard();
  board.recordMatch(match("Alice", [["Alice", 100]]));
  fs.writeFileSync(path.join(dir, "leaderboard.json"), "{ this is not json", "utf8");

  const reloaded = new Leaderboard(dir); // must not throw
  assert.equal(reloaded.size, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Leaderboard: match history keeps the most recent games first", () => {
  const { board, dir } = tempBoard();
  board.recordMatch(match("Alice", [["Alice", 100]]));
  board.recordMatch(match("Bob", [["Bob", 200]]));
  const recent = board.recentMatches();
  assert.equal(recent[0].winner, "Bob");
  assert.equal(recent[1].winner, "Alice");
  fs.rmSync(dir, { recursive: true, force: true });
});
