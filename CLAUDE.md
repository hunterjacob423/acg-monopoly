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
npm test                       # 95 tests, under a second
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
src/shared/                 imported by BOTH sides — board data, names, messages, pieces
client/src/                 React client
```

**The server is authoritative.** Clients send intents (`roll`, `buy`, `build`,
`proposeTrade`); the server validates and mutates. Never move a rule to the client.
Card decks live on the Room instance, not in the schema, so no client can read the
next card.

**The dice are thrown before the piece moves.** `handleRoll` broadcasts `dice`
before anything that moves a piece, and the client holds its move queue while the
throw is in the air. Messages arrive in the order they were sent, so that is all
the ordering it takes — no clocks, no timestamps.

`useGame` exposes `settling` — true from the throw until the piece has finished
arriving — and the sidebar holds the offer to buy behind it. The server decides
you have landed on a buyable square in the *same tick* that it starts the walk,
so without that guard the offer appears naming a square you can plainly see you
are not on yet. It has to be state rather than a read of the refs, or the
interface never re-renders when it clears.

There is a trap here worth remembering: a piece with nothing animating is drawn
at its *authoritative* position, which the server advances immediately. Delaying
the walk therefore made the piece jump to its destination and snap back. The fix
is that `move` pins the piece to the square it is leaving **when the message
arrives**, not when its animation starts. Anything that delays an animation
further has to respect the same rule.

**Every position change goes through `setPosition`**, which broadcasts a `move`
message so clients can animate the walk tile by tile. That broadcast is
presentational only: `Player.position` in the synced state stays the authority, and
the client falls back to it whenever nothing is animating, so a dropped message or a
reconnect corrects itself. `steps` is signed for a walk and 0 for a jump.

**`src/shared/` is imported by both sides** through the `@shared` Vite alias. Prices
and rents therefore cannot drift between the rules and the UI. Keep it that way.

**Names are separated from economics.** `shared/locations.ts` holds every square's
name and picture; `shared/board.ts` holds the rulebook and merges the theme over it
when it builds `BOARD`. So the board can be re-themed to places around the school
without touching a price, and there is still exactly one `BOARD` — nothing
downstream knows re-theming exists. The canonical London names stay in `board.ts`
as a fallback, so deleting an entry leaves a square named rather than blank.

Two consequences worth remembering:

- **Nothing may hardcode a square's name.** The Chance cards build their text with
  `at(39)` for this reason; they used to say "Advance to Mayfair" and would have
  named a square that no longer existed. Tests read names out of `BOARD` too, so
  re-theming cannot turn the suite red.
- **Property names must stay unique.** The BST name index overwrites on an exact
  duplicate key, so two squares sharing a name would leave one unreachable from the
  trade search — silently. `locations.test.ts` pins this.

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
| OOP | `MonopolyRoom extends Room`; `Player`/`Property`/`Trade`/`GameState extends Schema`; 44 private members |
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

## Chat

Player chat is in the synced schema (`ChatLine`, capped at 50) rather than a
broadcast, so a refresh does not lose the conversation — the same reasoning as
the event log. `shared/chat.ts` holds the cleaning as a pure function, imported
by both sides so the input's `maxLength` and the server's cut cannot drift.

It collapses whitespace (one message stays one line), strips control and
zero-width and bidi characters, cuts at 200 characters, and allows one message
every 600ms per player. **There is deliberately no word filter** — nothing here
judges what a message says. Hunter runs the room and can see everything in it.
If that ever needs to change, it is a conversation to have first, not a regex to
add quietly.

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

- **The whole board must stay in view at 100% zoom, on every screen.** It was
  briefly given a minimum size on phones and panned instead; that was rejected —
  seeing all four sides at once matters more than large squares, and panning left
  the controls stranded. The board is sized by whichever runs out first, the
  column's width or the window's height. Zoom is the way to see more detail, and
  the sidebar flows *below* the board on narrow screens, so the Roll dice button
  moves down with the board rather than being pinned beside a scrolling frame.
- **Dev mode is for the developer only.** The dev client hardcodes
  `ws://localhost:2567`, so on someone else's device it looks for a server on *their*
  machine. Anyone else joining needs `npm run build && npm start` on 2567.
- **`EDGE` in `Board.tsx` and `--edge` in `styles.css` must match.** The board's
  outer ring is wider than its nine inner tracks (currently 1.55 against 1), and
  the pieces are positioned from that ratio. Nothing catches the two drifting
  apart except pieces visibly landing off-centre, so change both or neither.
- **The board must stay square, and that takes three declarations.** The pieces
  are placed as fractions of a square board, so anything that lets the board grow
  taller than it is wide silently drags every piece off its square. It needs
  `min-height: 0` (as a flex item its automatic minimum is its *content* height,
  which outranks `aspect-ratio`), `minmax(0, …)` tracks (a bare `1fr` means
  `minmax(auto, 1fr)` and will not shrink below the longest name), and
  `min-width/min-height: 0` on the squares themselves. Removing any one of them
  breaks it only at low zoom, which is easy to miss.
- **Anything drawn on a square is sized in `cqw`,** against the `container-type:
  inline-size` on `.board`. That is what makes zoom buy legibility rather than
  empty space. Fixed px there will look wrong at one end of the zoom range.
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
