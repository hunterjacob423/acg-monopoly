import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Room } from "@colyseus/sdk";
import { BOARD } from "@shared/board";
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

/** How long a piece rests on each tile as it walks, and how long a jump holds for. */
const STEP_MS = 150;
const JUMP_MS = 420;

export interface MoveEvent { playerId: string; from: number; to: number; steps: number }
export interface CardEvent { deck: "chance" | "chest"; playerId: string; text: string }

/** How long a drawn card stays face up, and how long it takes to turn over. */
const CARD_HOLD_MS = 4200;
const CARD_TURN_MS = 340;

/** Every tile a walking piece passes through, in order, ending on the destination. */
function walkPath(from: number, steps: number): number[] {
  const n = BOARD.length;
  const direction = steps < 0 ? -1 : 1;
  const path: number[] = [];
  for (let i = 1; i <= Math.abs(steps); i++) {
    path.push((((from + direction * i) % n) + n) % n);
  }
  return path;
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

  /**
   * Where each piece is *drawn*, which lags the synced state while a move plays out.
   * A player is absent from this map when nothing of theirs is animating, and the
   * board then falls back to the authoritative position — so a dropped `move`
   * message or a reconnect corrects itself instead of stranding a piece.
   */
  const [pieces, setPieces] = useState<Record<string, number>>({});
  const moveQueue = useRef<MoveEvent[]>([]);
  const animating = useRef(false);

  /** Plays queued moves one at a time, so two of them never animate on top of each other. */
  const drain = useCallback<() => void>(() => {
    if (animating.current) return;
    const next = moveQueue.current.shift();
    if (!next) {
      setPieces({});
      return;
    }

    animating.current = true;
    const path = next.steps === 0 ? [next.to] : walkPath(next.from, next.steps);
    const settle = next.steps === 0 ? JUMP_MS : STEP_MS;

    let i = 0;
    const step = () => {
      // Read the tile into a const first: React runs the updater during the render,
      // by which time `i` has already moved on, and the piece would skip a tile.
      const tile = path[i];
      setPieces((current) => ({ ...current, [next.playerId]: tile }));
      i += 1;
      if (i < path.length) setTimeout(step, STEP_MS);
      else setTimeout(() => { animating.current = false; drain(); }, settle);
    };

    // Start from where the server says the piece was, so the first hop animates
    // rather than the piece appearing already part-way along.
    setPieces((current) => ({ ...current, [next.playerId]: next.from }));
    setTimeout(step, 16);
  }, []);

  /**
   * The card currently face up. Queued rather than shown directly, because two can
   * be drawn back to back: Chance on tile 36 can send you back three spaces onto
   * the Community Chest on tile 33, which draws again.
   */
  const [card, setCard] = useState<CardEvent | null>(null);
  const cardQueue = useRef<CardEvent[]>([]);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextCard = useCallback<() => void>(() => {
    const next = cardQueue.current.shift();
    if (!next) {
      cardTimer.current = null;
      setCard(null);
      return;
    }
    // Blank first, so a second card turns over again rather than its text
    // swapping underneath one that is already face up.
    setCard(null);
    cardTimer.current = setTimeout(() => {
      setCard(next);
      cardTimer.current = setTimeout(() => nextCard(), CARD_HOLD_MS);
    }, CARD_TURN_MS);
  }, []);

  const showCard = useCallback((c: CardEvent) => {
    cardQueue.current.push(c);
    if (!cardTimer.current) nextCard();
  }, [nextCard]);

  /** Clicking a card moves straight on to the next, or clears it. */
  const dismissCard = useCallback(() => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = null;
    nextCard();
  }, [nextCard]);

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
    joined.onMessage("card", (m: CardEvent) => showCard(m));
    joined.onMessage("move", (m: MoveEvent) => { moveQueue.current.push(m); drain(); });
    joined.onLeave(() => {
      sessionStorage.removeItem(STORAGE_KEY);
      moveQueue.current = [];
      animating.current = false;
      cardQueue.current = [];
      if (cardTimer.current) clearTimeout(cardTimer.current);
      cardTimer.current = null;
      setPieces({});
      setCard(null);
      setRoom(null);
      setState(null);
    });
    setRoom(joined);
  }, [drain, showCard]);

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
    room, state, error, toast, busy, passcodeRequired, pieces, card, dismissCard,
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
