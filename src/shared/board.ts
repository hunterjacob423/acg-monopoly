/**
 * Static board definition. Imported by BOTH the server (rules) and the client (rendering),
 * so there is exactly one source of truth for prices and rents.
 */

export type ColourGroup =
  | "brown" | "lightblue" | "pink" | "orange"
  | "red" | "yellow" | "green" | "darkblue";

export type TileKind =
  | "go" | "street" | "station" | "utility" | "chance"
  | "chest" | "tax" | "jail" | "freeparking" | "gotojail";

export interface Tile {
  index: number;
  name: string;
  kind: TileKind;
  /** Purchase price for street/station/utility. */
  price?: number;
  /** [base, 1 house, 2, 3, 4, hotel] for streets. */
  rent?: readonly number[];
  /** Cost of one house (a hotel costs the same as the 5th house). */
  houseCost?: number;
  group?: ColourGroup;
  /** Fixed amount for tax tiles. */
  tax?: number;
}

export const BOARD: readonly Tile[] = [
  { index: 0,  name: "GO", kind: "go" },
  { index: 1,  name: "Old Kent Road", kind: "street", group: "brown", price: 60, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
  { index: 2,  name: "Community Chest", kind: "chest" },
  { index: 3,  name: "Whitechapel Road", kind: "street", group: "brown", price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
  { index: 4,  name: "Income Tax", kind: "tax", tax: 200 },
  { index: 5,  name: "King's Cross Station", kind: "station", price: 200 },
  { index: 6,  name: "The Angel Islington", kind: "street", group: "lightblue", price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { index: 7,  name: "Chance", kind: "chance" },
  { index: 8,  name: "Euston Road", kind: "street", group: "lightblue", price: 100, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { index: 9,  name: "Pentonville Road", kind: "street", group: "lightblue", price: 120, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  { index: 10, name: "Jail / Just Visiting", kind: "jail" },
  { index: 11, name: "Pall Mall", kind: "street", group: "pink", price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { index: 12, name: "Electric Company", kind: "utility", price: 150 },
  { index: 13, name: "Whitehall", kind: "street", group: "pink", price: 140, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { index: 14, name: "Northumberland Avenue", kind: "street", group: "pink", price: 160, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
  { index: 15, name: "Marylebone Station", kind: "station", price: 200 },
  { index: 16, name: "Bow Street", kind: "street", group: "orange", price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { index: 17, name: "Community Chest", kind: "chest" },
  { index: 18, name: "Marlborough Street", kind: "street", group: "orange", price: 180, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { index: 19, name: "Vine Street", kind: "street", group: "orange", price: 200, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { index: 20, name: "Free Parking", kind: "freeparking" },
  { index: 21, name: "Strand", kind: "street", group: "red", price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { index: 22, name: "Chance", kind: "chance" },
  { index: 23, name: "Fleet Street", kind: "street", group: "red", price: 220, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { index: 24, name: "Trafalgar Square", kind: "street", group: "red", price: 240, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { index: 25, name: "Fenchurch St Station", kind: "station", price: 200 },
  { index: 26, name: "Leicester Square", kind: "street", group: "yellow", price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { index: 27, name: "Coventry Street", kind: "street", group: "yellow", price: 260, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { index: 28, name: "Water Works", kind: "utility", price: 150 },
  { index: 29, name: "Piccadilly", kind: "street", group: "yellow", price: 280, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  { index: 30, name: "Go To Jail", kind: "gotojail" },
  { index: 31, name: "Regent Street", kind: "street", group: "green", price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { index: 32, name: "Oxford Street", kind: "street", group: "green", price: 300, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { index: 33, name: "Community Chest", kind: "chest" },
  { index: 34, name: "Bond Street", kind: "street", group: "green", price: 320, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  { index: 35, name: "Liverpool Street Station", kind: "station", price: 200 },
  { index: 36, name: "Chance", kind: "chance" },
  { index: 37, name: "Park Lane", kind: "street", group: "darkblue", price: 350, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { index: 38, name: "Super Tax", kind: "tax", tax: 100 },
  { index: 39, name: "Mayfair", kind: "street", group: "darkblue", price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
] as const;

export const JAIL_INDEX = 10;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const STARTING_MONEY = 1500;
/** Rent for owning 1, 2, 3 or 4 stations. */
export const STATION_RENT = [25, 50, 100, 200] as const;

/** Every tile index that can be owned. */
export const OWNABLE = BOARD
  .filter((t) => t.kind === "street" || t.kind === "station" || t.kind === "utility")
  .map((t) => t.index);

export function tilesInGroup(group: ColourGroup): number[] {
  return BOARD.filter((t) => t.group === group).map((t) => t.index);
}

export const GROUP_COLOURS: Record<ColourGroup, string> = {
  brown: "#7b4a2d", lightblue: "#a9dbf0", pink: "#d43b8c", orange: "#e8862b",
  red: "#d5232a", yellow: "#f3d423", green: "#1c9e4b", darkblue: "#1b52a4",
};
