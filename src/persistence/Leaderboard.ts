import * as fs from "fs";
import * as path from "path";
import { bubbleSort, insertionSort } from "../structures/sorting";
import { binarySearch } from "../structures/searching";

/**
 * Persistent all-time leaderboard, stored as a JSON file on disk so results
 * survive a server restart.
 *
 * Records are held sorted by name, which is what makes binary search possible:
 * looking a player up is O(log n) rather than scanning the whole file.
 */

export interface PlayerRecord {
  name: string;
  gamesPlayed: number;
  wins: number;
  /** Highest net worth this player has ever finished a game with. */
  bestNetWorth: number;
}

/** One finished game, appended to the match history. */
export interface MatchResult {
  playedAt: string;
  roomCode: string;
  winner: string;
  /** Every player's final standing, best first. */
  standings: Array<{ name: string; netWorth: number }>;
}

const byName = (a: PlayerRecord, b: PlayerRecord) => a.name.localeCompare(b.name);

export class Leaderboard {
  private records: PlayerRecord[] = [];
  private history: MatchResult[] = [];

  constructor(private readonly dataDir = path.join(__dirname, "../../data")) {
    this.load();
  }

  private get recordsPath() { return path.join(this.dataDir, "leaderboard.json"); }
  private get historyPath() { return path.join(this.dataDir, "matches.json"); }

  /**
   * Read both files from disk. A missing file is the normal first-run case, not
   * an error, so it produces an empty leaderboard rather than a crash. A file
   * that exists but is corrupt is reported and then ignored, because losing the
   * leaderboard is far better than refusing to start the server.
   */
  load(): void {
    this.records = this.readJson<PlayerRecord[]>(this.recordsPath, []);
    this.history = this.readJson<MatchResult[]>(this.historyPath, []);
    // Guarantee the sorted invariant that binary search depends on, in case the
    // file was hand-edited.
    this.records = insertionSort(this.records, byName);
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch (err) {
      console.error(`Could not read ${path.basename(file)}, starting empty:`, err);
      return fallback;
    }
  }

  /** Write both files, creating the data directory the first time. */
  save(): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.recordsPath, JSON.stringify(this.records, null, 2), "utf8");
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history.slice(-100), null, 2), "utf8");
    } catch (err) {
      console.error("Could not write the leaderboard:", err);
    }
  }

  /**
   * Find a player. O(log n) via binary search, which is only valid because
   * `records` is kept sorted by name at all times.
   */
  find(name: string): PlayerRecord | undefined {
    const probe: PlayerRecord = { name, gamesPlayed: 0, wins: 0, bestNetWorth: 0 };
    const index = binarySearch(this.records, probe, byName);
    return index === -1 ? undefined : this.records[index];
  }

  /**
   * Record one finished game. New players are inserted with insertion sort,
   * which is the right choice here: the array is already sorted and only one
   * element is out of place, so it costs O(n) shifts and no comparisons beyond
   * finding the gap — where re-running a general sort would be wasteful.
   */
  recordMatch(result: MatchResult): void {
    for (const standing of result.standings) {
      const existing = this.find(standing.name);
      if (existing) {
        existing.gamesPlayed++;
        if (standing.name === result.winner) existing.wins++;
        existing.bestNetWorth = Math.max(existing.bestNetWorth, standing.netWorth);
      } else {
        this.records.push({
          name: standing.name,
          gamesPlayed: 1,
          wins: standing.name === result.winner ? 1 : 0,
          bestNetWorth: standing.netWorth,
        });
        this.records = insertionSort(this.records, byName);
      }
    }
    this.history.push(result);
    this.save();
  }

  /**
   * The top players by wins, then by best net worth as a tiebreak.
   *
   * Bubble sort is used deliberately: the list is small (one entry per person who
   * has ever played, so tens at most), this runs only when someone opens the
   * leaderboard, and the early-exit pass makes it O(n) on the common case where
   * the order has not changed since last time.
   */
  top(limit = 10): PlayerRecord[] {
    const ranked = bubbleSort(this.records, (a, b) =>
      b.wins - a.wins || b.bestNetWorth - a.bestNetWorth || a.name.localeCompare(b.name));
    return ranked.slice(0, limit);
  }

  recentMatches(limit = 10): MatchResult[] {
    return this.history.slice(-limit).reverse();
  }

  get size(): number { return this.records.length; }
}
