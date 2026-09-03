import { useEffect, useState, type CSSProperties } from "react";
import {
  BOARD, GROUP_COLOURS, STATION_RENT, mortgageValue, unmortgageCost,
  type ColourGroup,
} from "@shared/board";
import type { PropertyView, Snapshot } from "./types";

/**
 * The rows printed on a title deed. These are the static figures from the board
 * definition, exactly as a real card lists them — deliberately NOT a computed
 * "what you would owe right now", which stays the server's business.
 */
function rentRows(tile: number): Array<{ label: string; value: string; houses?: number }> {
  const def = BOARD[tile];

  if (def.kind === "station") {
    return STATION_RENT.map((rent, i) => ({
      label: i === 0 ? "Rent" : `If ${i + 1} stations owned`,
      value: `£${rent}`,
    }));
  }

  if (def.kind === "utility") {
    return [
      { label: "If one utility owned", value: "4 × dice" },
      { label: "If both owned", value: "10 × dice" },
    ];
  }

  const rent = def.rent ?? [];
  return [
    { label: "Rent", value: `£${rent[0] ?? 0}`, houses: 0 },
    { label: "With 1 house", value: `£${rent[1] ?? 0}`, houses: 1 },
    { label: "With 2 houses", value: `£${rent[2] ?? 0}`, houses: 2 },
    { label: "With 3 houses", value: `£${rent[3] ?? 0}`, houses: 3 },
    { label: "With 4 houses", value: `£${rent[4] ?? 0}`, houses: 4 },
    { label: "With HOTEL", value: `£${rent[5] ?? 0}`, houses: 5 },
  ];
}

function TitleDeed({ prop, index, send }: {
  prop: PropertyView; index: number; send: (t: string, p?: unknown) => void;
}) {
  const def = BOARD[prop.tile];
  const band = def.group ? GROUP_COLOURS[def.group as ColourGroup] : "#5b6672";
  // Held in a variable rather than transition-delay directly, so hovering a card
  // does not inherit the deal-in stagger and lift a second later.
  const style = { "--delay": `${index * 35}ms` } as CSSProperties;

  return (
    <article className={`deed${prop.mortgaged ? " mortgaged" : ""}`} style={style}>
      <header className="deed-band" style={{ background: band }}>
        <span className="deed-kind">Title Deed</span>
        <span className="deed-name">{def.name}</span>
      </header>

      <dl className="deed-rents">
        {rentRows(prop.tile).map((row) => (
          <div key={row.label} className={`deed-row${row.houses === prop.houses ? " current" : ""}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="deed-costs">
        {def.houseCost !== undefined && <div>Houses cost £{def.houseCost} each</div>}
        <div>Mortgage value £{mortgageValue(prop.tile)}</div>
        {prop.mortgaged && <div className="deed-lift">Lift for £{unmortgageCost(prop.tile)}</div>}
      </div>

      <div className="deed-actions">
        {def.kind === "street" && (
          <button title="Build a house" onClick={() => send("build", { tile: prop.tile })}>+</button>
        )}
        {def.kind === "street" && prop.houses > 0 && (
          <button title="Sell a house" onClick={() => send("sell", { tile: prop.tile })}>−</button>
        )}
        {prop.mortgaged
          ? <button onClick={() => send("unmortgage", { tile: prop.tile })}>Lift</button>
          : <button onClick={() => send("mortgage", { tile: prop.tile })}>Mortgage</button>}
      </div>

      {prop.mortgaged && <div className="deed-stamp">Mortgaged</div>}
    </article>
  );
}

/** The player's hand of title deeds, dealt up over the board. */
export function PropertyHand({ state, selfId, send, open, onClose }: {
  state: Snapshot; selfId: string;
  send: (t: string, p?: unknown) => void;
  open: boolean; onClose: () => void;
}) {
  // The hand stays mounted for the length of the closing animation, or the cards
  // would blink out instead of dropping back off the bottom of the screen.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // A frame later, so the browser has painted the off-screen start position
      // and the change to it actually transitions.
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const mine = Object.values(state.properties)
    .filter((p) => p.ownerId === selfId)
    .sort((a, b) => a.tile - b.tile);

  return (
    <>
      <div className={`hand-backdrop${shown ? " shown" : ""}`} onClick={onClose} />
      <div className={`hand${shown ? " shown" : ""}`}>
        <div className="hand-head">
          <span>Your property ({mine.length})</span>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        <div className="hand-cards">
          {mine.length === 0 && <p className="hand-empty">You do not own anything yet.</p>}
          {mine.map((p, i) => <TitleDeed key={p.tile} prop={p} index={i} send={send} />)}
        </div>
      </div>
    </>
  );
}
