import { useState } from "react";
import { BOARD } from "@shared/board";
import { TOKENS, tokenGlyph } from "@shared/tokens";
import { Board } from "./Board";
import { useGame } from "./useGame";
import { TradeBuilder, TradeInbox } from "./Trade";
import { PropertyHand } from "./PropertyCards";
import { Chat } from "./Chat";
import type { Snapshot } from "./types";

export function App() {
  const {
    state, error, toast, busy, passcodeRequired, pieces, card, dismissCard, dice,
    createGame, joinGame, send, selfId, room, clearError,
  } = useGame();

  if (!room || !state) {
    return (
      <Entry
        error={error}
        busy={busy}
        passcodeRequired={passcodeRequired}
        onCreate={createGame}
        onJoin={joinGame}
        clearError={clearError}
      />
    );
  }

  return (
    <div className="app">
      {state.phase === "lobby"
        ? <Lobby state={state} selfId={selfId} send={send} />
        : <Board state={state} pieces={pieces} card={card} dice={dice} onDismissCard={dismissCard} />}
      <Sidebar state={state} selfId={selfId} send={send} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

type Mode = "menu" | "create" | "join";

function Entry({ error, busy, passcodeRequired, onCreate, onJoin, clearError }: {
  error: string | null;
  busy: boolean;
  passcodeRequired: boolean;
  onCreate: (name: string, passcode: string) => void;
  onJoin: (code: string, name: string, passcode: string) => void;
  clearError: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");

  const go = (next: Mode) => { clearError(); setMode(next); };

  if (mode === "menu") {
    return (
      <div className="entry">
        <h1>ACG Monopoly</h1>
        <p>Start a new game and share the code, or join one a friend has started.</p>
        <button onClick={() => go("create")}>Create a game</button>
        <button className="secondary" onClick={() => go("join")}>Join a game</button>
      </div>
    );
  }

  const creating = mode === "create";
  return (
    <form
      className="entry"
      onSubmit={(e) => {
        e.preventDefault();
        creating ? onCreate(name, passcode) : onJoin(code, name, passcode);
      }}
    >
      <h1>{creating ? "Create a game" : "Join a game"}</h1>
      <p>
        {creating
          ? "You'll get a code to share with everyone else."
          : "Enter the code the host gave you."}
      </p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={16}
        required
        autoFocus
      />

      {!creating && (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Game code"
          maxLength={8}
          required
        />
      )}

      {passcodeRequired && (
        <input
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Class passcode"
          type="password"
          required
        />
      )}

      <button type="submit" disabled={busy}>
        {busy ? "Connecting…" : creating ? "Create game" : "Join game"}
      </button>
      <button type="button" className="secondary" onClick={() => go("menu")}>Back</button>

      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Lobby({ state, selfId, send }: {
  state: Snapshot; selfId: string; send: (t: string, p?: unknown) => void;
}) {
  const players = Object.values(state.players);
  const isHost = state.players[selfId]?.isHost;
  const [copied, setCopied] = useState(false);

  // navigator.clipboard only exists on secure origins, and LAN play is plain http,
  // so fall back to the old execCommand path rather than silently doing nothing.
  const copy = async () => {
    const text = state.roomCode;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* leave the code on screen to read out instead */ }
  };

  return (
    <div className="lobby">
      <p className="muted">Everyone joins with this code</p>
      <div className="code-display">
        <span className="code">{state.roomCode}</span>
        <button className="secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="muted">on <strong>{location.host}</strong></p>

      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span className="seat" style={{ borderColor: p.colour }}>{tokenGlyph(p.token)}</span>
            {p.name} {p.isHost && "(host)"}
          </li>
        ))}
      </ul>

      <h4 className="picker-title">Your piece</h4>
      <div className="token-picker">
        {TOKENS.map((t) => {
          const holder = players.find((p) => p.token === t.id);
          const mine = holder?.id === selfId;
          return (
            <button
              key={t.id}
              type="button"
              className={`token-option${mine ? " mine" : ""}`}
              disabled={!!holder && !mine}
              title={holder && !mine ? `${holder.name} has the ${t.label}` : t.label}
              onClick={() => send("chooseToken", { token: t.id })}
            >
              <span className="token-glyph">{t.glyph}</span>
              <span className="token-name">{t.label}</span>
            </button>
          );
        })}
      </div>

      {isHost
        ? <button disabled={players.length < 2} onClick={() => send("start")}>
            {players.length < 2 ? "Waiting for another player…" : `Start game (${players.length} players)`}
          </button>
        : <p className="muted">Waiting for the host to start…</p>}
    </div>
  );
}

function Sidebar({ state, selfId, send }: {
  state: Snapshot; selfId: string; send: (t: string, p?: unknown) => void;
}) {
  const [tradeOpen, setTradeOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const me = state.players[selfId];
  const currentId = state.turnOrder[state.currentTurn];
  const myTurn = currentId === selfId;
  const inDebt = (me?.money ?? 0) < 0;

  const myTiles = Object.values(state.properties).filter((p) => p.ownerId === selfId);

  return (
    <aside className="sidebar">
      <section className="players">
        {Object.values(state.players).map((p) => (
          <div key={p.id} className={`player ${p.id === currentId ? "active" : ""} ${p.bankrupt ? "out" : ""}`}>
            <span className="seat" style={{ borderColor: p.colour }}>{tokenGlyph(p.token)}</span>
            <span className="pname">{p.name}{!p.connected && " (away)"}</span>
            <span className="money">£{p.money}</span>
            {p.inJail && <span className="tag">jail</span>}
          </div>
        ))}
      </section>

      {state.phase === "ended" && (
        <div className="banner win">{state.players[state.winnerId]?.name} wins!</div>
      )}
      {inDebt && (
        <div className="banner debt">
          You owe £{-me.money}. Sell or mortgage to cover it.
          <button onClick={() => send("declareBankruptcy")}>Declare bankruptcy</button>
        </div>
      )}

      {state.phase !== "lobby" && <section className="actions">
        {myTurn && state.phase === "rolling" && (
          <>
            <button onClick={() => send("roll")}>Roll dice</button>
            {me?.inJail && (
              <button onClick={() => send("payFine")}>
                {me.jailCards > 0 ? "Use jail card" : "Pay £50 fine"}
              </button>
            )}
          </>
        )}
        {myTurn && state.phase === "deciding" && (
          <>
            <button onClick={() => send("buy")}>
              Buy {BOARD[state.pendingPurchase]?.name} — £{BOARD[state.pendingPurchase]?.price}
            </button>
            <button onClick={() => send("decline")}>Decline</button>
          </>
        )}
        {myTurn && state.phase === "acting" && (
          <button onClick={() => send("endTurn")} disabled={inDebt}>End turn</button>
        )}
        {!myTurn && state.phase !== "ended" && currentId && (
          <p className="waiting">Waiting for {state.players[currentId]?.name}…</p>
        )}
      </section>}

      {state.phase !== "lobby" && state.phase !== "ended" && !me?.bankrupt && (
        tradeOpen
          ? <TradeBuilder state={state} selfId={selfId} send={send} onClose={() => setTradeOpen(false)} />
          : <section className="actions">
              <button className="secondary" onClick={() => setTradeOpen(true)}>Offer a trade</button>
            </section>
      )}

      <TradeInbox state={state} selfId={selfId} send={send} />

      {state.phase !== "lobby" && <section className="holdings">
        <h3>Your property</h3>
        <button className="secondary show-cards" onClick={() => setCardsOpen(true)}>
          Show cards ({myTiles.length})
        </button>
        {myTiles.length === 0 && <p className="muted">Nothing yet.</p>}
        {myTiles.map((p) => {
          const def = BOARD[p.tile];
          return (
            <div key={p.tile} className="holding">
              <span>{def.name}{p.houses ? ` (${p.houses === 5 ? "hotel" : p.houses + "h"})` : ""}</span>
              <span className="holding-buttons">
                {def.kind === "street" && <button onClick={() => send("build", { tile: p.tile })}>+</button>}
                {def.kind === "street" && p.houses > 0 && <button onClick={() => send("sell", { tile: p.tile })}>−</button>}
                {p.mortgaged
                  ? <button onClick={() => send("unmortgage", { tile: p.tile })}>lift</button>
                  : <button onClick={() => send("mortgage", { tile: p.tile })}>mtg</button>}
              </span>
            </div>
          );
        })}
      </section>}

      <section className="log">
        {state.log.slice(-14).reverse().map((line, i) => <div key={i}>{line}</div>)}
      </section>

      <Chat state={state} selfId={selfId} send={send} />

      <PropertyHand
        state={state}
        selfId={selfId}
        send={send}
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
      />
    </aside>
  );
}
