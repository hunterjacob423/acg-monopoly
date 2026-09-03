# ACG Monopoly

Real-time multiplayer Monopoly (UK board) for a class-sized group. One Node process serves
both the React client and the authoritative Colyseus game server, so there is a single
origin, a single deploy, and no CORS to keep in sync.

## Stack

| Layer | Choice |
|---|---|
| Client | React 18 + Vite + TypeScript, `@colyseus/sdk` |
| Server | `@colyseus/core` 0.18 + `@colyseus/ws-transport`, Express for static files |
| State sync | `@colyseus/schema` — the server owns the state, clients only send intents |
| Hosting | Fly.io, one `shared-cpu-1x` machine, scale-to-zero |

No database, no Redis, no accounts. A game lives in memory for the length of a match.

## Run it locally

```
npm install          # also installs client/
npm run dev          # game server on :2567
npm run dev:client   # Vite on :5173  (second terminal)
```

Open http://localhost:5173. The landing screen offers two paths:

- **Create a game** — the client generates a 5-character code (no I/O/0/1, so it can be read
  off a screen without ambiguity) and opens a lobby showing it. Share that code.
- **Join a game** — enter the code the host read out. This uses Colyseus `join()`, not
  `joinOrCreate()`, so a mistyped code is an error rather than a second empty room that
  nobody else can find.

Only the host can start, and a game needs at least 2 players (max 6).

### Passcode

Leave `CLASS_PASSCODE` unset and anyone who can reach the server can play. Set it to require
a shared passcode:

```
CLASS_PASSCODE=your-passcode npm start
```

The join screen asks the server (`GET /config`) whether a passcode is needed and only shows
the box when it is — so the field never appears with nothing valid to type in it.

To run exactly what production runs:

```
npm run build && npm start   # everything on :2567
```

## Layout

```
src/
  index.ts                 Express + Colyseus wiring, serves client/dist
  rooms/MonopolyRoom.ts    the authoritative game loop and every message handler
  rooms/schema/GameState.ts  what gets synced to clients
  game/rules.ts            pure rule helpers (rent, build legality, net worth)
  game/cards.ts            Chance / Community Chest — deliberately server-only
  shared/board.ts          the 40 tiles, prices and rents; imported by BOTH sides
  shared/messages.ts       the complete client -> server vocabulary
client/src/
  useGame.ts               connection, reconnection, state snapshots
  App.tsx / Board.tsx      join screen, lobby, board, sidebar
```

`shared/` is aliased into the client as `@shared`, so prices and rents cannot drift between
the rules and the UI.

## Anti-cheat notes

The client never mutates game state — it sends intents (`roll`, `buy`, `build`, …) and the
server re-validates each one against whose turn it is, the current phase, and the rules
before touching state. Card decks live on the `Room` instance rather than in the schema, so
no client can read the upcoming order. A tampered client can only send messages the server
will reject.

## Putting it online

Colyseus needs a **persistent process** — it holds WebSocket connections and keeps
rooms in memory. Serverless hosts (Vercel, Netlify, Cloudflare Workers) cannot do
that, so they are not an option no matter how the app is packaged.

### Quickest: a tunnel from your own machine

No deploy and no account. Run the server locally, then expose it:

```
npm run build && npm start
cloudflared tunnel --url http://localhost:2567     # in a second terminal
```

It prints a public `https://….trycloudflare.com` address. WebSockets pass through,
and it works from any network. The URL changes each run and only lives as long as
the command does, so this is for testing rather than for handing out.

### Free hosting: Render

`render.yaml` in this repo configures a free web service. Connect the repo at
[render.com](https://render.com) and choose "Blueprint". The free plan sleeps after
about 15 minutes of inactivity and takes roughly a minute to wake, so the first
person to open the link waits; after that it is responsive. The filesystem is
ephemeral, so `data/` is lost on each restart — completed games will not persist.

## Deploying to Fly.io

```
brew install flyctl
fly auth login
fly launch --no-deploy      # keeps the committed fly.toml
fly secrets set CLASS_PASSCODE=your-passcode
fly deploy
```

`min_machines_running = 0` means the machine sleeps when nobody is playing and wakes on the
next request (~2s cold start). Open WebSockets count as active connections, so a game in
progress is never shut down underneath you. **Keep it at one machine** — with several
machines, matchmaking would need Redis, and players entering the same room code could land
on different machines and never see each other.

## A-level data structures and algorithms

Each structure is written from scratch in `src/structures/` and does a real job in
the game, rather than existing to be demonstrated.

| Structure | Where it is used | Why that one |
|---|---|---|
| Circular linked list | `game/BoardGraph.ts` — the board itself | Squares physically lead to the next; Mayfair leads back to GO. Passing GO falls out of the walk instead of needing index comparisons |
| Circular queue | `MonopolyRoom.turnQueue` | Ending a turn dequeues the player and enqueues them at the back; the rotation repeats with no wrapping index |
| Queue | Chance / Community Chest draw piles | Monopoly returns a used card to the *bottom* of the pile — first in, first out |
| Stack | Card discard piles | The most recent card sits on top; the pile is popped one card at a time to refill the draw queue when it empties |
| Hash table | `MonopolyRoom.playerIndex` | Every incoming message needs a player lookup by session ID. O(1) average, with separate chaining that reuses the linked list |
| Binary search tree | Property lookup for the trade screen, via the `searchProperty` message | O(log n) lookup by name, and a prefix search built on the in-order traversal returns matches already alphabetical |
| Recursion | BST insert/search/traversal/height, `moveRecursive`, `binarySearchRecursive` | The tree is defined recursively; the iterative and recursive forms of movement and binary search sit side by side for comparison |
| Bubble sort | End-of-game standings (`recordResult`) | At most 6 entries, sorted once. The early-exit pass makes it O(n) when order is unchanged |
| Insertion sort | Leaderboard inserts, property portfolios | The list is already sorted and one element is out of place — insertion sort's best case |
| Binary search | `Leaderboard.find` | Records are kept sorted by name, so lookup is O(log n) rather than a linear scan |
| File handling | `persistence/Leaderboard.ts` | Leaderboard and match history as JSON, surviving restarts. Missing files are a normal first run; corrupt files are survived, not fatal |

### Design documentation

Full design documentation — architecture, class relationships, data dictionary, the
turn state machine, algorithm analysis and the test plan — is in
[`docs/design.html`](docs/design.html). Open it in a browser.

### Testing

```
npm test
```

76 tests covering every structure, the rent and building rules, board movement, and
trading, and the leaderboard's file handling. Written with Node's built-in test runner, so there
is no test framework dependency.

Two bugs were found by these tests and fixed: `unmortgageCost` charged a pound too
much because `200 * 1.1` is `220.00000000000003` in floating point, and a two-player
game never declared a winner because bankruptcy advanced the turn instead of ending
the game.

### A note on persistence in production

The leaderboard writes to `data/` inside the container. On Fly with
`min_machines_running = 0` that directory is lost when the machine stops, so a
deployed leaderboard needs a Fly volume mounted at `/app/data`. Locally it just works.

## Not built yet

- **Auctions** when a player declines a property — it currently stays with the bank
- Free Parking pot, house/hotel supply limits (32/12), and the even-build rule across
  *selling* back to the bank in a shortage
- Persistence: a server restart loses in-progress games by design
