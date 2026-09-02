import { useState } from "react";
import { BOARD, GROUP_COLOURS, type ColourGroup } from "@shared/board";
import type { Snapshot, TradeView } from "./types";

/** A property chip: colour band, name, and a tick when it is part of the offer. */
function Chip({ tile, picked, onToggle, disabled }: {
  tile: number; picked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  const def = BOARD[tile];
  return (
    <button
      type="button"
      className={`chip ${picked ? "picked" : ""}`}
      onClick={onToggle}
      disabled={disabled}
      title={disabled ? "Sell the houses first" : def.name}
    >
      <span
        className="chip-band"
        style={{ background: def.group ? GROUP_COLOURS[def.group as ColourGroup] : "#7b8a80" }}
      />
      {def.name}
    </button>
  );
}

/** Builds and sends an offer. */
export function TradeBuilder({ state, selfId, send, onClose }: {
  state: Snapshot; selfId: string;
  send: (t: string, p?: unknown) => void;
  onClose: () => void;
}) {
  const others = Object.values(state.players).filter((p) => p.id !== selfId && !p.bankrupt);
  const [withId, setWithId] = useState(others[0]?.id ?? "");
  const [offerTiles, setOfferTiles] = useState<number[]>([]);
  const [requestTiles, setRequestTiles] = useState<number[]>([]);
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);

  const mine = Object.values(state.properties).filter((p) => p.ownerId === selfId);
  const theirs = Object.values(state.properties).filter((p) => p.ownerId === withId);

  const toggle = (list: number[], set: (v: number[]) => void, tile: number) =>
    set(list.includes(tile) ? list.filter((t) => t !== tile) : [...list, tile]);

  if (others.length === 0) {
    return (
      <div className="trade-panel">
        <p className="muted">Nobody left to trade with.</p>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="trade-panel">
      <h3>Offer a trade</h3>

      <label className="field">
        <span>With</span>
        <select value={withId} onChange={(e) => { setWithId(e.target.value); setRequestTiles([]); }}>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <h4>You give</h4>
      <div className="chips">
        {mine.length === 0 && <span className="muted">You own nothing yet.</span>}
        {mine.map((p) => (
          <Chip key={p.tile} tile={p.tile} picked={offerTiles.includes(p.tile)}
            disabled={p.houses > 0}
            onToggle={() => toggle(offerTiles, setOfferTiles, p.tile)} />
        ))}
      </div>
      <label className="field">
        <span>Cash</span>
        <input type="number" min={0} value={offerMoney}
          onChange={(e) => setOfferMoney(Math.max(0, Math.floor(+e.target.value || 0)))} />
      </label>

      <h4>You get</h4>
      <div className="chips">
        {theirs.length === 0 && <span className="muted">They own nothing yet.</span>}
        {theirs.map((p) => (
          <Chip key={p.tile} tile={p.tile} picked={requestTiles.includes(p.tile)}
            disabled={p.houses > 0}
            onToggle={() => toggle(requestTiles, setRequestTiles, p.tile)} />
        ))}
      </div>
      <label className="field">
        <span>Cash</span>
        <input type="number" min={0} value={requestMoney}
          onChange={(e) => setRequestMoney(Math.max(0, Math.floor(+e.target.value || 0)))} />
      </label>

      <div className="trade-actions">
        <button onClick={() => {
          send("proposeTrade", { toId: withId, offerTiles, requestTiles, offerMoney, requestMoney });
          onClose();
        }}>Send offer</button>
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/** Offers waiting on you, and offers you have sent. */
export function TradeInbox({ state, selfId, send }: {
  state: Snapshot; selfId: string; send: (t: string, p?: unknown) => void;
}) {
  const trades = Object.values(state.trades ?? {});
  if (trades.length === 0) return null;

  const names = (tiles: number[], money: number) => {
    const parts = tiles.map((t) => BOARD[t].name);
    if (money > 0) parts.push(`£${money}`);
    return parts.length ? parts.join(", ") : "nothing";
  };

  return (
    <section className="trades">
      {trades.map((t: TradeView) => {
        const incoming = t.toId === selfId;
        const other = state.players[incoming ? t.fromId : t.toId];
        return (
          <div key={t.id} className="trade-offer">
            <div className="trade-head">
              {incoming ? `${other?.name} offers` : `Sent to ${other?.name}`}
            </div>
            <div className="trade-line">
              <span className="trade-label">{incoming ? "You get" : "You give"}</span>
              <span>{names(t.offerTiles, t.offerMoney)}</span>
            </div>
            <div className="trade-line">
              <span className="trade-label">{incoming ? "You give" : "You get"}</span>
              <span>{names(t.requestTiles, t.requestMoney)}</span>
            </div>
            <div className="trade-actions">
              {incoming ? (
                <>
                  <button onClick={() => send("acceptTrade", { tradeId: t.id })}>Accept</button>
                  <button className="secondary" onClick={() => send("rejectTrade", { tradeId: t.id })}>Reject</button>
                </>
              ) : (
                <button className="secondary" onClick={() => send("cancelTrade", { tradeId: t.id })}>Withdraw</button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
