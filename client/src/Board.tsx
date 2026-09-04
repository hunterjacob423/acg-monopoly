import { useState, type CSSProperties } from "react";
import { BOARD, GROUP_COLOURS, type ColourGroup } from "@shared/board";
import { locationImage } from "@shared/locations";
import { tokenGlyph } from "@shared/tokens";
import { DeckCard, DeckPiles } from "./DeckCard";
import { Dice } from "./Dice";
import { TileDetails } from "./TileDetails";
import type { CardEvent, DiceView } from "./useGame";
import type { Snapshot } from "./types";

/**
 * The outer ring's tracks are wider than the nine inner ones, so the squares
 * people actually read are bigger without the board itself growing. A real board
 * is the same shape — the track is deeper than a ninth of the middle.
 *
 * MUST match `--edge` in styles.css. Nothing enforces that, so change both.
 */
const EDGE = 1.55;
const TRACK_TOTAL = 2 * EDGE + 9;

/**
 * How far the centre of track `i` sits from the board's edge, as a fraction of
 * the board. The pieces are positioned from this rather than from a plain
 * eleventh, which would leave them drifting off-centre now the tracks differ.
 */
function trackCentre(i: number): number {
  if (i === 0) return EDGE / 2 / TRACK_TOTAL;
  if (i === 10) return (EDGE + 9 + EDGE / 2) / TRACK_TOTAL;
  return (EDGE + (i - 1) + 0.5) / TRACK_TOTAL;
}

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

/*
  Zoom exists because the board is square and therefore limited by the height of
  the window, not its width — on a laptop that leaves the squares small however
  the tracks are divided up. Above 1 the board simply overflows and its container
  scrolls, which is what you want on a projector or when reading a crowded corner.
*/
const ZOOM_KEY = "acg-board-zoom";
// 100% already fits the whole board in view, so below that is only for freeing
// up room around it rather than for seeing more of the board.
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

function storedZoom(): number {
  // localStorage throws outright in some privacy modes, so a failure here must
  // not stop the board rendering.
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (saved >= ZOOM_MIN && saved <= ZOOM_MAX) return saved;
  } catch {}
  return 1;
}

export function Board({ state, pieces, card, dice, onDismissCard }: {
  state: Snapshot;
  pieces: Record<string, number>;
  card: CardEvent | null;
  dice: DiceView | null;
  onDismissCard: () => void;
}) {
  const [zoom, setZoom] = useState(storedZoom);
  /** The square whose details are open, or null. Read-only: see TileDetails. */
  const [inspecting, setInspecting] = useState<number | null>(null);

  const changeZoom = (by: number) => {
    // Rounded because repeated adding of .15 drifts (0.8 + .15 + .15 is not 1.1),
    // and the drift would eventually escape the min/max check on reload.
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + by)) * 100) / 100;
    setZoom(next);
    try { localStorage.setItem(ZOOM_KEY, String(next)); } catch {}
  };

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
    <div className="board-area" style={{ "--zoom": zoom } as CSSProperties}>
      <div className="board-zoom">
        <button onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Smaller board">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Bigger board">+</button>
      </div>

      <div className="board">
      {BOARD.map((tile) => {
        const prop = state.properties[String(tile.index)];
        const owner = prop?.ownerId ? state.players[prop.ownerId] : undefined;
        const photo = locationImage(tile.image);

        return (
          <button
            key={tile.index}
            type="button"
            className="tile"
            style={cell(tile.index)}
            title={`${tile.name} — click for details`}
            onClick={() => setInspecting(tile.index)}
          >
            {tile.group && (
              <div className="tile-band" style={{ background: GROUP_COLOURS[tile.group as ColourGroup] }} />
            )}

            {/*
              A background image rather than an <img>: a filename that is missing or
              misspelt then renders as nothing at all, instead of a broken-image
              icon in the middle of the board. Squares can be renamed long before
              anyone gets round to photographing them.
            */}
            {photo && (
              <div className="tile-photo" style={{ backgroundImage: `url("${photo}")` }} />
            )}

            <div className="tile-text">
              <div className="tile-name">{tile.name}</div>
              {tile.price !== undefined && <div className="tile-price">£{tile.price}</div>}
            </div>

            {prop?.houses ? (
              <div className="tile-houses">{prop.houses === 5 ? "🏨" : "🏠".repeat(prop.houses)}</div>
            ) : null}
            {prop?.mortgaged && <div className="tile-mortgaged">MTG</div>}
            {owner && <div className="tile-owner" style={{ background: owner.colour }} />}
          </button>
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
          const col = gridColumn - 1;
          const row = gridRow - 1;
          const style = {
            borderColor: p.colour,
            // The fraction places the piece; the plain index adds back the gaps
            // between tracks, which the fraction knows nothing about.
            "--cfrac": trackCentre(col),
            "--rfrac": trackCentre(row),
            "--col": col,
            "--row": row,
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
        <Dice
          die1={dice?.die1 ?? state.die1}
          die2={dice?.die2 ?? state.die2}
          rolling={dice?.rolling ?? false}
        />

        <DeckPiles drawing={card?.deck ?? null} />

        {/* Sits inside the ring, so pieces walking the edge stay visible behind it. */}
        <DeckCard card={card} state={state} onDismiss={onDismissCard} />
      </div>
      </div>

      <TileDetails tile={inspecting} state={state} onClose={() => setInspecting(null)} />
    </div>
  );
}
