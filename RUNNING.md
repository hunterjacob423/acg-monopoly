# How to run ACG Monopoly

Every command assumes you are in the project folder.

**Mac** — the folder name has a space in it, so the quotes matter:

```
cd "/Users/hunterjacob/Comp Sci/acg monopoly"
```

**Linux:**

```
cd ~/Documents/project-cs-2026/acg-monopoly
```

---

## Before anything: check your Node version

The server needs **Node 22 or newer**. On Node 18 the build succeeds and then
`npm start` crashes straight away with `ERR_REQUIRE_ESM`, because Colyseus reaches a
dependency shipped as an ES module that older Node refuses to `require`.

```
node -v
```

On Linux, Node 22 comes from nvm, and nvm only loads in terminals opened *after* it
was installed. A terminal reporting `v18` simply missed it — run `nvm use 22`, or open
a new terminal. npm should be 11: older versions rewrite `package-lock.json` on every
install and leave phantom changes in `git status`.

---

## 1. Just play on this machine

```
npm run build && npm start
```

Then open <http://localhost:2567>.

`npm run build` compiles the TypeScript server and bundles the React client. You only
need it after changing code — if nothing has changed since last time, `npm start` on
its own is enough.

The server runs in the foreground and prints a log. **Ctrl-C stops it.**

---

## 2. Play with people on the same wifi

Start the server exactly as above, then find this machine's address:

**Mac:**

```
ipconfig getifaddr en0
```

**Linux:**

```
hostname -I | awk '{print $1}'
```

Give people `http://THAT-ADDRESS:2567` — for example `http://192.168.1.42:2567`.

The address changes whenever you switch network, so check it each time. macOS may ask
you to allow incoming connections the first time; say yes. On Linux, if you have a
firewall enabled, allow the port with `sudo ufw allow 2567`.

> Some school and public networks block device-to-device traffic entirely. If people
> can load the page at home but not at school, that is the cause — use the tunnel below.

---

## 3. Play with people anywhere (Cloudflare tunnel)

This gives you a public HTTPS address that works from any network, without deploying
anything. You need **two terminals**.

**Terminal 1** — the game server:

```
npm run build && npm start
```

**Terminal 2** — the tunnel:

```
cloudflared tunnel --url http://localhost:2567
```

After a few seconds it prints a URL like:

```
https://favourites-wall-selling-lakes.trycloudflare.com
```

Share that URL. That is the whole thing — no account, no configuration.

**To stop public access:** Ctrl-C in terminal 2. The URL dies immediately.

### Getting the URL back

The URL scrolls out of view as soon as cloudflared starts logging connections. Rather
than hunting for it, ask the tunnel directly — it runs a small metrics server on
localhost, which uses port 20241 unless that port is taken:

```
curl -s http://127.0.0.1:20241/quicktunnel
```

That prints `{"hostname":"....trycloudflare.com"}` without restarting anything.

If 20241 was busy, cloudflared silently picks another port. Pin it when you start the
tunnel so the command above always works:

```
cloudflared tunnel --url http://localhost:2567 --metrics localhost:20241
```

Things to know:

- The URL is **different every time** you start the tunnel.
- It only works while that command is running and your machine is awake.
- All the traffic goes through your machine, so it is for testing, not for leaving up.

### First install only

**Mac:**

```
brew install cloudflared
```

**Linux** — Mint's release codename is not in Cloudflare's apt repository, so install
the official `.deb` directly rather than adding the repo:

```
curl -L -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
```

```
sudo dpkg -i /tmp/cloudflared.deb
```

Run those two again to update it later.

---

## 4. While you are editing code (hot reload)

Two terminals again, but this mode rebuilds automatically as you save.

**Terminal 1** — server, restarts on save:

```
npm run dev
```

**Terminal 2** — client, updates instantly in the browser:

```
npm run dev:client
```

Then open <http://localhost:5173> — note the **different port**.

> **This mode is for you alone.** The dev client has `ws://localhost:2567` hardcoded,
> so on someone else's device it tries to reach a game server on *their* machine and
> fails. For anyone else to join, always use `npm run build && npm start` on port 2567.

---

## 5. Requiring a passcode

Without one, anyone who can reach the server can play. To require a shared passcode:

```
CLASS_PASSCODE=your-passcode npm start
```

The join screen asks the server whether a passcode is needed, so the box only appears
when you have actually set one.

---

## 6. Changing the board to local places

Open `src/shared/locations.ts` and type over the names. That file is the only place
square names live, so one edit updates the board, the title deed cards, the trade
screen and the Chance cards together. Prices and rents are in `board.ts` and are not
affected.

To add a photo, put it in `client/public/locations/` and name it in the same entry:

```ts
16: { name: "Sports Hall", image: "sports-hall.jpg" },
```

Then rebuild:

```bash
npm run build && npm start
```

A square with no photo, or one whose filename is wrong, just shows its name — you will
never get a broken-image icon, so it is fine to rename everything now and add pictures
later. `client/public/locations/README.md` covers sizes and formats.

Two rules the tests will enforce if you break them: no two properties may share a name
(the search index would lose one), and `image` must be a bare filename, not a path.

## 7. Running the tests

```
npm test
```

Compiles everything and runs all 88 tests. Takes under a second.

---

## Stopping things

| What | How |
| --- | --- |
| Server running in your terminal | Ctrl-C |
| Tunnel running in your terminal | Ctrl-C |
| A server you lost track of | `pkill -f "node build/index.js"` |
| A tunnel you lost track of | `pkill -f cloudflared` |

Check whether anything is still listening:

```
lsof -nP -iTCP:2567 -sTCP:LISTEN
```

---

## After cloning or pulling

A fresh clone has no `node_modules`, so install first. This also installs the client's
dependencies automatically:

```
npm install
```

Run it again after a `git pull` that changes `package.json`, otherwise you will get
"Cannot find module" errors.

---

## If something is wrong

| Symptom | Cause |
| --- | --- |
| Page loads but sticks on "Connecting…" | You are in dev mode (port 5173) and sharing it, or the server is not running |
| `EADDRINUSE` on start | A server is already running — `pkill -f "node build/index.js"` |
| Others cannot reach your LAN address | Wrong address, a firewall, or the network blocks device-to-device |
| Tunnel prints an error instead of a URL | The server is not running yet — start it first |
| Tunnel URL shows a Cloudflare error page | The tunnel is up but nothing is listening on 2567 |
| Lost the tunnel URL | `curl -s http://127.0.0.1:20241/quicktunnel` |
| "Cannot find module" | Run `npm install` |
| Code changes do nothing | You ran `npm start` without `npm run build` first |
| `ERR_REQUIRE_ESM` on `npm start` | That terminal is on Node 18 — check `node -v`, then `nvm use 22` |
| `package-lock.json` keeps changing on its own | That terminal is on npm 10 or older; it needs npm 11 |
