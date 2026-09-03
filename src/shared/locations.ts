/**
 * THE ONE FILE YOU EDIT TO RE-THEME THE BOARD.
 *
 * Every square's name and picture lives here. Nothing else does — prices, rents
 * and house costs stay in `board.ts`, so renaming a square can never unbalance
 * the game or break a test.
 *
 * ── To rename a square ────────────────────────────────────────────────────────
 *   Change its `name`. That is the whole job. The name updates everywhere at
 *   once: the board, the title deed cards, the trade screen, the event log, and
 *   the Chance cards that send you to a named square.
 *
 * ── To add a picture ──────────────────────────────────────────────────────────
 *   1. Drop the image into  client/public/locations/
 *   2. Put its filename in `image` below, e.g.  image: "sports-hall.jpg"
 *
 *   Landscape photos work best — the tile crops to a wide strip. Keep them
 *   under about 200 kB each or the first load gets slow; JPG for photos, PNG
 *   for logos or anything with text.
 *
 *   A square with no `image` just shows its name, and so does one whose file is
 *   missing or misspelt — you get a plain tile, never a broken-image icon. So
 *   you can rename all 40 squares today and add the photos over time.
 *
 * ── If you delete an entry ────────────────────────────────────────────────────
 *   The square falls back to the original London name from `board.ts`, so the
 *   board is never left with a blank tile.
 *
 * The colour groups are listed below because they set the price: brown is the
 * cheapest corner of the board and dark blue the most expensive, so pick places
 * whose status roughly matches — the joke only lands if the bike sheds are cheap.
 */

export interface Location {
  /** Shown on the tile and everywhere the square is named. Keep it short — two
   *  or three words fits; longer names shrink to fit but get hard to read. */
  name: string;
  /** Filename inside client/public/locations/. Omit for no picture. */
  image?: string;
  /** Optional detail, shown when hovering the square. */
  blurb?: string;
}

export const LOCATIONS: Record<number, Location> = {
  // ── Bottom edge (right to left) ────────────────────────────────────────────
  0:  { name: "GO" },
  1:  { name: "Old Kent Road", image: "Non Parametric Tests Parnell 4.png" },  // brown — cheapest
  2:  { name: "Community Chest" },
  3:  { name: "Whitechapel Road" },         // brown
  4:  { name: "Income Tax" },
  5:  { name: "King's Cross Station" },     // station
  6:  { name: "The Angel Islington" },      // light blue
  7:  { name: "Chance" },
  8:  { name: "Euston Road" },              // light blue
  9:  { name: "Pentonville Road" },         // light blue
  10: { name: "Jail / Just Visiting" },

  // ── Left edge (bottom to top) ──────────────────────────────────────────────
  11: { name: "Pall Mall" },                // pink
  12: { name: "Electric Company" },         // utility
  13: { name: "Whitehall" },                // pink
  14: { name: "Northumberland Avenue" },    // pink
  15: { name: "Marylebone Station" },       // station
  16: { name: "Bow Street" },               // orange
  17: { name: "Community Chest" },
  18: { name: "Marlborough Street" },       // orange
  19: { name: "Vine Street" },              // orange
  20: { name: "Free Parking" },

  // ── Top edge (left to right) ───────────────────────────────────────────────
  21: { name: "Strand" },                   // red
  22: { name: "Chance" },
  23: { name: "Fleet Street" },             // red
  24: { name: "Trafalgar Square" },         // red
  25: { name: "Fenchurch St Station" },     // station
  26: { name: "Leicester Square" },         // yellow
  27: { name: "Coventry Street" },          // yellow
  28: { name: "Water Works" },              // utility
  29: { name: "Piccadilly" },               // yellow
  30: { name: "Go To Jail" },

  // ── Right edge (top to bottom) ─────────────────────────────────────────────
  31: { name: "Regent Street" },            // green
  32: { name: "Oxford Street" },            // green
  33: { name: "Community Chest" },
  34: { name: "Bond Street" },              // green
  35: { name: "Liverpool Street Station" }, // station
  36: { name: "Chance" },
  37: { name: "Park Lane" },                // dark blue
  38: { name: "Super Tax" },
  39: { name: "Mayfair" },                  // dark blue — most expensive
};

/** Where tile pictures are served from. Vite copies client/public/ into the build. */
export const IMAGE_BASE = "/locations/";

/** Full URL for a tile's picture, or undefined if it has none. */
export function locationImage(image?: string): string | undefined {
  return image ? IMAGE_BASE + image : undefined;
}
