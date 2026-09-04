import { useEffect } from "react";
import {
  BOARD, GROUP_COLOURS, JAIL_FINE, GO_SALARY, mortgageValue, unmortgageCost,
  type ColourGroup,
} from "@shared/board";
import { locationImage } from "@shared/locations";
import { rentRows } from "./PropertyCards";
import type { Snapshot } from "./types";

/**
 * What a square that cannot be bought actually does. Written from the board
 * definition rather than hardcoded per index, so a re-themed board still
 * describes itself correctly.
 */
function describe(tile: number): string {
  const def = BOARD[tile];
  switch (def.kind) {
    case "go": return `Collect £${GO_SALARY} every time you pass or land here.`;
    case "chance": return "Draw a Chance card and do as it says.";
    case "chest": return "Draw a Community Chest card and do as it says.";
    case "tax": return `Pay £${def.tax} to the bank.`;
    case "jail": return `Just visiting — nothing happens, unless you were sent here. Leaving early costs £${JAIL_FINE}, or roll a double.`;
    case "freeparking": return "Nothing happens. No money is collected here — that is a house rule, not a real one.";
    case "gotojail": return "Go straight to jail. You do not pass GO and you collect nothing.";
    default: return "";
  }
}

/**
 * The details panel for any square on the board, opened by clicking it.
 *
 * Read-only by design: buying, building and mortgaging all stay in the sidebar
 * and on the player's own title deeds, so there is no way to act on a square
 * here by accident while looking something up mid-turn.
 */
export function TileDetails({ tile, state, onClose }: {
  tile: number | null;
  state: Snapshot;
  onClose: () => void;
}) {
  // Registered whenever the panel is open, and only then, so Escape does not
  // swallow keystrokes meant for the rest of the page.
  useEffect(() => {
    if (tile === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tile, onClose]);

  if (tile === null) return null;

  const def = BOARD[tile];
  const prop = state.properties[String(tile)];
  const owner = prop?.ownerId ? state.players[prop.ownerId] : undefined;
  const ownable = prop !== undefined;
  const band = def.group ? GROUP_COLOURS[def.group as ColourGroup] : "#5b6672";
  const photo = locationImage(def.image);

  return (
    <>
      <div className="info-backdrop" onClick={onClose} />
      <div className="info-panel" role="dialog" aria-label={def.name}>
        <header className="info-band" style={{ background: band }}>
          <span className="deed-kind">{ownable ? "Title Deed" : "Square"}</span>
          <span className="info-name">{def.name}</span>
        </header>

        {photo && (
          <div className="info-photo" style={{ backgroundImage: `url("${photo}")` }} />
        )}

        <div className="info-body">
          {def.blurb && <p className="info-blurb">{def.blurb}</p>}

          {ownable ? (
            <>
              <div className="info-line">
                <span>Price</span><span>£{def.price}</span>
              </div>

              <dl className="deed-rents">
                {rentRows(tile).map((row) => (
                  <div
                    key={row.label}
                    className={`deed-row${row.houses === prop.houses ? " current" : ""}`}
                  >
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="deed-costs">
                {def.houseCost !== undefined && <div>Houses cost £{def.houseCost} each</div>}
                <div>Mortgage value £{mortgageValue(tile)}</div>
                {prop.mortgaged && <div className="deed-lift">Lift for £{unmortgageCost(tile)}</div>}
              </div>

              <div className="info-owner">
                {owner ? (
                  <>
                    <span className="info-dot" style={{ background: owner.colour }} />
                    Owned by {owner.name}
                    {prop.houses > 0 && (prop.houses === 5 ? " · hotel" : ` · ${prop.houses} house${prop.houses > 1 ? "s" : ""}`)}
                    {prop.mortgaged && " · mortgaged"}
                  </>
                ) : "Unowned — still with the bank."}
              </div>
            </>
          ) : (
            <p className="info-what">{describe(tile)}</p>
          )}
        </div>

        <button className="secondary info-close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
