# How to run ACG Monopoly

Every command assumes you are in the project folder. The folder name has a space in
it, so the quotes matter:

```
cd "/Users/hunterjacob/Comp Sci/acg monopoly"
```

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

```
ipconfig getifaddr en0
```

Give people `http://THAT-ADDRESS:2567` — for example `http://192.168.1.42:2567`.

The address changes whenever you switch network, so check it each time. macOS may ask
you to allow incoming connections the first time; say yes.

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

Things to know:

- The URL is **different every time** you start the tunnel.
- It only works while that command is running and your laptop is awake.
- All the traffic goes through your machine, so it is for testing, not for leaving up.
- First install only: `brew install cloudflared`

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

## 6. Running the tests

```
npm test
```

Compiles everything and runs all 76 tests. Takes under a second.

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
| Others cannot reach your LAN address | Wrong address, macOS firewall, or the network blocks device-to-device |
| Tunnel prints an error instead of a URL | The server is not running yet — start it first |
| Tunnel URL shows a Cloudflare error page | The tunnel is up but nothing is listening on 2567 |
| "Cannot find module" | Run `npm install` |
| Code changes do nothing | You ran `npm start` without `npm run build` first |
