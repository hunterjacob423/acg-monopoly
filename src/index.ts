import path from "path";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MonopolyRoom } from "./rooms/MonopolyRoom";

const port = Number(process.env.PORT) || 2567;

// The React build is served from this same process, so there is one origin,
// one deploy, and no CORS configuration to keep in sync.
const clientDist = path.join(__dirname, "../client/dist");

const gameServer = new Server({
  transport: new WebSocketTransport(),

  // In 0.18 the transport owns the HTTP server and hands us its Express app,
  // so our own routes have to be registered here rather than on a separate server.
  express: (app) => {
    // Fly's health check hits this to decide the machine is up.
    app.get("/health", (_req, res) => { res.send("ok"); });

    // Lets the join screen show a passcode box only when one is actually needed.
    app.get("/config", (_req, res) => {
      res.json({ passcodeRequired: !!process.env.CLASS_PASSCODE });
    });

    app.use(express.static(clientDist));

    // SPA fallback. The negative lookahead keeps it from shadowing Colyseus's
    // own matchmaking endpoints, which live under /matchmake.
    app.get(/^(?!\/matchmake|\/config|\/health).*$/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  },
});

// filterBy("roomCode") makes joinOrCreate match only rooms with the same code,
// which is the whole of our "access control": share a code, share a game.
gameServer.define("monopoly", MonopolyRoom).filterBy(["roomCode"]);

gameServer.listen(port).then(() => {
  console.log(`Monopoly server listening on http://localhost:${port}`);
});
