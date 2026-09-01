import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Room } from "@colyseus/sdk";
import type { Snapshot } from "./types";

/** Dev runs Vite on 5173 and the game server on 2567; production serves both from one origin. */
const httpBase = import.meta.env.DEV ? "http://localhost:2567" : "";
const endpoint = import.meta.env.DEV
  ? "ws://localhost:2567"
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

const STORAGE_KEY = "monopoly-reconnect";

/** No I/O/0/1 — these get misread when a code is copied off someone's screen. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode(): string {
  return Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
}

export function useGame() {
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Whether the server was started with CLASS_PASSCODE set. */
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const clientRef = useRef(new Client(endpoint));

  // Ask the server whether a passcode is needed, so we never show a box nobody can fill in.
  useEffect(() => {
    fetch(`${httpBase}/config`)
      .then((r) => r.json())
      .then((c: { passcodeRequired: boolean }) => setPasscodeRequired(!!c.passcodeRequired))
      .catch(() => setPasscodeRequired(false));
  }, []);

  const attach = useCallback((joined: Room) => {
    sessionStorage.setItem(STORAGE_KEY, joined.reconnectionToken);
    // The whole board is small, so re-reading it on every patch is cheaper in
    // complexity than wiring per-field callbacks, and it survives version changes.
    joined.onStateChange((next: any) => setState(next.toJSON() as Snapshot));
    joined.onMessage("error", (m: { message: string }) => setToast(m.message));
    joined.onMessage("card", (m: { text: string }) => setToast(m.text));
    joined.onLeave(() => { sessionStorage.removeItem(STORAGE_KEY); setRoom(null); setState(null); });
    setRoom(joined);
  }, []);

  // A page refresh mid-game rejoins the same seat rather than losing it.
  useEffect(() => {
    const token = sessionStorage.getItem(STORAGE_KEY);
    if (!token) return;
    clientRef.current.reconnect(token).then(attach).catch(() => {
      sessionStorage.removeItem(STORAGE_KEY);
    });
  }, [attach]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Always makes a NEW room and returns its code. */
  const createGame = useCallback(async (name: string, passcode: string) => {
    setError(null);
    setBusy(true);
    try {
      const created = await clientRef.current.create("monopoly", {
        roomCode: newRoomCode(),
        name: name.trim(),
        passcode,
      });
      attach(created);
    } catch (e: any) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [attach]);

  /**
   * Joins an EXISTING room only. Using join() rather than joinOrCreate() means a
   * mistyped code is an error instead of silently creating an empty second room
   * that the rest of the group never finds.
   */
  const joinGame = useCallback(async (roomCode: string, name: string, passcode: string) => {
    setError(null);
    setBusy(true);
    try {
      const joined = await clientRef.current.join("monopoly", {
        // filterBy matches the raw option value, so the client MUST normalise the
        // case here — the server cannot fix a lowercase code after the fact.
        roomCode: roomCode.trim().toUpperCase(),
        name: name.trim(),
        passcode,
      });
      attach(joined);
    } catch (e: any) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [attach]);

  const send = useCallback((type: string, payload?: unknown) => {
    room?.send(type, payload);
  }, [room]);

  return {
    room, state, error, toast, busy, passcodeRequired,
    createGame, joinGame, send, clearError: () => setError(null),
    selfId: room?.sessionId ?? "",
  };
}

/** Colyseus matchmaking errors are terse; say what the player can actually do about it. */
function friendly(e: any): string {
  const msg = String(e?.message ?? "");
  if (/no rooms found|not found/i.test(msg)) {
    return "No game with that code. Check the code, or ask the host to create the game first.";
  }
  if (/passcode/i.test(msg)) return msg;
  if (/already started/i.test(msg)) return "That game has already started.";
  if (/locked|full/i.test(msg)) return "That game is full.";
  return msg || "Could not connect. Is the server running?";
}
