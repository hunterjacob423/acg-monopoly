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

## Not built yet

- **Trades** between players (the fiddliest part; the schema has room for it)
- **Auctions** when a player declines a property — it currently stays with the bank
- Free Parking pot, house/hotel supply limits (32/12), and the even-build rule across
  *selling* back to the bank in a shortage
- Persistence: a server restart loses in-progress games by design
