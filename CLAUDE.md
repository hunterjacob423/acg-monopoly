# CLAUDE.md

Project memory for ACG Monopoly. Read this before doing anything else, and update it
when something here stops being true.

---

## What this is

A real-time multiplayer Monopoly (UK board) for Hunter's **A-level Computer Science**
class — roughly 20–30 students, a handful of concurrent games. Not a product.

Two things drive every decision:

1. **It is coursework.** The specification requires object-oriented programming, file
   handling, bubble sort, insertion sort, binary search, recursion, stacks and queues,
   linked lists, binary trees and hash tables. See "A-level requirements" below.
2. **It is small.** Deleting infrastructure is the guiding principle: no database, no
   Redis, no accounts, one process.

---

## Commands

```bash
npm install                    # after cloning or a package.json change; also installs client/
npm run build && npm start     # compile everything, serve on http://localhost:2567
npm test                       # 76 tests, under a second
npm run dev                    # server with reload  ┐ hot-reload mode,
npm run dev:client             # client on :5173     ┘ FOR THE DEVELOPER ONLY
```

`RUNNING.md` has the full reference including the Cloudflare tunnel. Do not duplicate
it here — link to it.

---

## Architecture

One Node process serves **both** the compiled React client and the Colyseus game
server, so there is a single origin, one deploy, and no CORS.

```
src/index.ts                Express + Colyseus wiring; serves client/dist
src/rooms/MonopolyRoom.ts   authoritative game loop; every message handler
src/rooms/schema/           what is synchronised to clients
src/game/rules.ts           pure rule functions — no side effects, easily tested
src/game/BoardGraph.ts      board as a circular linked list + BST name index
src/game/cards.ts           Chance / Community Chest (server-only by design)
src/structures/             hand-written data structures and algorithms
src/persistence/            JSON file handling for the leaderboard
src/shared/                 imported by BOTH sides — board data and message types
client/src/                 React client
```

**The server is authoritative.** Clients send intents (`roll`, `buy`, `build`,
`proposeTrade`); the server validates and mutates. Never move a rule to the client.
Card decks live on the Room instance, not in the schema, so no client can read the
next card.

**`src/shared/` is imported by both sides** through the `@shared` Vite alias. Prices
and rents therefore cannot drift between the rules and the UI. Keep it that way.

**Structures vs schema.** Colyseus's `MapSchema` is the *wire format*; the hand-written
structures in `src/structures/` are the *engine*. Game logic reads through
`playerIndex` (the HashTable) so the rules do not depend on the transport library.
This distinction is stated in the design document — keep the two consistent.

---

## Colyseus 0.18 gotchas

Most tutorials online are written for 0.14/0.15 and **will not compile here**.

- The client package is **`@colyseus/sdk`** (0.18.x). `colyseus.js` is the old name,
  stuck at 0.16 with schema v3, which cannot decode a 0.18 server's v5 schema.
- Use **`@colyseus/core`** directly, not the `colyseus` meta-package — that pulls in
  monitor, playground, redis-driver and redis-presence, none of which are wanted.
- `Room`'s generic is an options bag: `Room<{ state: GameState }>`, not
  `Room<GameState>`.
- `onLeave(client, code?: number)` — there is no `consented` boolean. Compare against
  `CloseCode.CONSENTED` (4000), exported from `@colyseus/core`.
- **Never call `setPrivate()`.** A private room is excluded from matchmaking entirely,
  so nobody could join by room code. The code plus `CLASS_PASSCODE` is the access
  control. This bug cost an hour once already.
- The transport owns the HTTP server. Register Express routes via the
  `express: (app) => {...}` option on `new Server({...})`, then `gameServer.listen()`.
  A hand-rolled `createServer(app)` leaves `/matchmake` unmounted and everything 404s.
- `filterBy` matches the **raw** option the client sends, so the client must uppercase
  the room code before calling `join`. The server cannot fix it afterwards.
- Use `client.create()` / `client.join()`, never `joinOrCreate()`, when a human types
  a code: `joinOrCreate` turns a typo into a new empty room nobody else can find.
- The SDK auto-reconnects a dropped socket by itself. The stored `reconnectionToken`
  is still needed for a page refresh, which destroys the JS context.
- Rooms refuse automatic reconnection until they have been up 5 seconds.

---

## A-level requirements

Each structure was mapped to a job the game genuinely has. **Do not add a structure
with no real consumer** — a marker spots decoration immediately.

| Requirement | Where it does real work |
| --- | --- |
| OOP | `MonopolyRoom extends Room`; `Player`/`Property`/`Trade`/`GameState extends Schema`; 41 private members |
| Circular linked list | The board — `BoardGraph.ts`. Movement follows `next` pointers; passing GO falls out of the walk |
| Linked list | Hash table collision chains |
| Circular queue | Turn order — rotate on every turn end |
| Queue | Card draw piles (a used card goes to the *bottom*, the real rule) |
| Stack | Card discard piles, turned over to refill the draw queue |
| Hash table | Player lookup by session ID, on every message. djb2 + separate chaining |
| Binary tree | Property name index, reached live via the `searchProperty` message from the trade screen |
| Recursion | BST insert / search / in-order traversal (live). `moveRecursive` and `binarySearchRecursive` are deliberate duplicates for comparison, covered by tests |
| Bubble sort | End-of-game standings (n ≤ 6, run once) |
| Insertion sort | Leaderboard — nearly-sorted input is its best case |
| Binary search | Leaderboard lookup by name (kept sorted for exactly this) |
| File handling | `data/leaderboard.json` and `data/matches.json` |

**The event log is NOT a Stack.** It is the synced `ArraySchema` using push/shift — a
bounded FIFO queue that the client renders reversed. This was documented wrongly once;
do not reintroduce the error.

---

## Conventions

- TypeScript everywhere, `strict: true` on both sides. No `.js` in source.
- Tests are `*.test.ts` **next to the code they test**, using Node's built-in
  `node:test` and `node:assert` — deliberately no test framework dependency.
- `npm test` runs `build/**/*.test.js`. Pointing Node at all of `build/` would execute
  `index.js`, start the server and hang forever.
- Rules go in `rules.ts` as pure functions so they are testable without a network.
- Never edit `build/` or `client/dist/` — generated, gitignored, overwritten by builds.
- Comments explain *why*, not what.

---

## Traps

- **Dev mode is for the developer only.** The dev client hardcodes
  `ws://localhost:2567`, so on someone else's device it looks for a server on *their*
  machine. Anyone else joining needs `npm run build && npm start` on 2567.
- **Never scale currency by a decimal.** `200 * 1.1` is `220.00000000000003`, which
  once overcharged £1 on unmortgaging. Use integer arithmetic: `Math.ceil(v * 11 / 10)`.
- **Validate trades twice** — on proposal and again on acceptance. The proposer may
  have spent the cash or built on a property while the offer sat open. Two tests pin
  this; do not "simplify" it away.
- **Keep it to one machine.** Multiple processes would need Redis for shared
  matchmaking, and two players entering the same code could land on different machines
  and never see each other.
- Serverless hosts (Vercel, Netlify, Cloudflare Workers) **cannot run this** — there is
  nowhere for an in-memory room to live between requests.

---

## Defects found and fixed (keep in the design doc for the evaluation)

1. **A two-player game never ended.** Bankruptcy on your own turn called `nextTurn()`,
   which found the survivor and returned before `checkForWinner()` ever ran.
2. **Unmortgaging overcharged £1** — the floating-point issue above.

Both were found by tests, not by playing.

---

## Not built yet

- Auctions when a property is declined (it currently stays with the bank)
- House and hotel supply limits (32 / 12 in the real game; unlimited here)
- Resuming an interrupted game — a restart loses games in progress by design
- Free Parking collects nothing (matches the printed rules, not the house rule)

---

## Documentation

- `README.md` — overview, stack, layout, deploying
- `RUNNING.md` — every command, including the Cloudflare tunnel
- `docs/design.html` — full design documentation for the coursework: architecture,
  data dictionary, state machine, complexity analysis, test plan, defects.
  **If you change behaviour, update this file too.**

---

## Keeping this file current

This file is the memory that survives between machines and sessions. When a decision
is made, a gotcha is discovered, or a limitation is removed, edit it in the same commit
as the change. Facts here should be verified against the code before being relied on —
if it names a file or flag, check it still exists.
