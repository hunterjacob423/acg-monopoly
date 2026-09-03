import type { CSSProperties } from "react";
import { BOARD, GROUP_COLOURS, type ColourGroup } from "@shared/board";
import { tokenGlyph } from "@shared/tokens";
import type { Snapshot } from "./types";

/**
 * Maps a tile index onto an 11x11 CSS grid: 0 sits bottom-right and the
 * indices run anticlockwise around the edge.
 */
function cell(index: number): { gridRow: number; gridColumn: number } {
  if (index === 0) return { gridRow: 11, gridColumn: 11 };
  if (index < 10) return { gridRow: 11, gridColumn: 11 - index };
  if (index === 10) return { gridRow: 11, gridColumn: 1 };
  if (index < 20) return { gridRow: 21 - index, gridColumn: 1 };
  if (index === 20) return { gridRow: 1, gridColumn: 1 };
  if (index < 30) return { gridRow: 1, gridColumn: index - 19 };
  if (index === 30) return { gridRow: 1, gridColumn: 11 };
  return { gridRow: index - 29, gridColumn: 11 };
}

export function Board({ state, pieces }: { state: Snapshot; pieces: Record<string, number> }) {
  const players = Object.values(state.players).filter((p) => !p.bankrupt);

  // Pieces sharing a tile are fanned out so none is completely hidden behind another.
  const seat: Record<string, number> = {};
  const occupied: Record<number, number> = {};
  for (const p of players) {
    const at = pieces[p.id] ?? p.position;
    seat[p.id] = occupied[at] ?? 0;
    occupied[at] = seat[p.id] + 1;
  }

  return (
    <div className="board">
      {BOARD.map((tile) => {
        const prop = state.properties[String(tile.index)];
        const owner = prop?.ownerId ? state.players[prop.ownerId] : undefined;

        return (
          <div key={tile.index} className="tile" style={cell(tile.index)}>
            {tile.group && (
              <div className="tile-band" style={{ background: GROUP_COLOURS[tile.group as ColourGroup] }} />
            )}
            <div className="tile-name">{tile.name}</div>
            {tile.price !== undefined && <div className="tile-price">£{tile.price}</div>}

            {prop?.houses ? (
              <div className="tile-houses">{prop.houses === 5 ? "🏨" : "🏠".repeat(prop.houses)}</div>
            ) : null}
            {prop?.mortgaged && <div className="tile-mortgaged">MTG</div>}
            {owner && <div className="tile-owner" style={{ background: owner.colour }} />}
          </div>
        );
      })}

      {/*
        Pieces sit in one overlay rather than inside each tile. Moving one is then a
        CSS transition between two points, instead of it vanishing from one tile and
        reappearing in another.
      */}
      <div className="board-pieces">
        {players.map((p) => {
          const at = pieces[p.id] ?? p.position;
          const { gridRow, gridColumn } = cell(at);
          const style = {
            borderColor: p.colour,
            "--row": gridRow - 1,
            "--col": gridColumn - 1,
            "--seat": seat[p.id],
          } as CSSProperties;

          return (
            <div key={p.id} className="piece" style={style} title={`${p.name} — ${BOARD[at].name}`}>
              {tokenGlyph(p.token)}
            </div>
          );
        })}
      </div>

      <div className="board-centre">
        <h1>MONOPOLY</h1>
        <div className="room-code">Room {state.roomCode}</div>
        {state.die1 > 0 && (
          <div className="dice">
            <span>{state.die1}</span><span>{state.die2}</span>
          </div>
        )}
      </div>
    </div>
  );
}
