/**
 * Pure rule helpers over GameState. No Colyseus messaging in here, so these can be
 * unit tested (and reasoned about) on their own.
 */
import { BOARD, STATION_RENT, tilesInGroup, type ColourGroup } from "../shared/board";
import type { GameState } from "../rooms/schema/GameState";

export function countOwned(state: GameState, ownerId: string, kind: "station" | "utility"): number {
  let n = 0;
  state.properties.forEach((p) => {
    if (p.ownerId === ownerId && BOARD[p.tile].kind === kind) n++;
  });
  return n;
}

/** True when the player owns every tile of that colour group. */
export function ownsWholeGroup(state: GameState, ownerId: string, group: ColourGroup): boolean {
  return tilesInGroup(group).every((i) => state.properties.get(String(i))?.ownerId === ownerId);
}

/** Rent owed for landing on `tile`. `diceTotal` only matters for utilities. */
export function rentFor(state: GameState, tile: number, diceTotal: number): number {
  const prop = state.properties.get(String(tile));
  const def = BOARD[tile];
  if (!prop || !prop.ownerId || prop.mortgaged) return 0;

  if (def.kind === "station") {
    const owned = countOwned(state, prop.ownerId, "station");
    return STATION_RENT[Math.max(0, owned - 1)] ?? 0;
  }
  if (def.kind === "utility") {
    const owned = countOwned(state, prop.ownerId, "utility");
    return diceTotal * (owned >= 2 ? 10 : 4);
  }
  if (def.kind === "street" && def.rent) {
    if (prop.houses > 0) return def.rent[prop.houses];
    // Undeveloped street in a complete set pays double.
    const whole = def.group ? ownsWholeGroup(state, prop.ownerId, def.group) : false;
    return whole ? def.rent[0] * 2 : def.rent[0];
  }
  return 0;
}

/**
 * Why a build is illegal, or null if it is allowed. Enforces the even-build rule:
 * you may never have two more houses on one street than on another in the same group.
 */
export function buildError(state: GameState, playerId: string, tile: number): string | null {
  const def = BOARD[tile];
  const prop = state.properties.get(String(tile));
  const player = state.players.get(playerId);
  if (!player || !prop || !def || def.kind !== "street" || !def.group) return "You cannot build there.";
  if (prop.ownerId !== playerId) return "You do not own that street.";
  if (!ownsWholeGroup(state, playerId, def.group)) return "You need the whole colour group first.";
  if (prop.houses >= 5) return "That street already has a hotel.";

  const group = tilesInGroup(def.group);
  if (group.some((i) => state.properties.get(String(i))?.mortgaged)) {
    return "You cannot build while a street in the group is mortgaged.";
  }
  const lowest = Math.min(...group.map((i) => state.properties.get(String(i))!.houses));
  if (prop.houses > lowest) return "Houses must be built evenly across the group.";
  if (player.money < (def.houseCost ?? 0)) return "You cannot afford that house.";
  return null;
}

/** Mirror of buildError for selling: you must sell evenly, from the top down. */
export function sellError(state: GameState, playerId: string, tile: number): string | null {
  const def = BOARD[tile];
  const prop = state.properties.get(String(tile));
  if (!prop || !def || def.kind !== "street" || !def.group) return "Nothing to sell there.";
  if (prop.ownerId !== playerId) return "You do not own that street.";
  if (prop.houses === 0) return "There are no houses to sell.";

  const group = tilesInGroup(def.group);
  const highest = Math.max(...group.map((i) => state.properties.get(String(i))!.houses));
  if (prop.houses < highest) return "Houses must be sold evenly across the group.";
  return null;
}

/** Cash plus half the value of everything sellable — used to decide forced bankruptcy. */
export function netWorth(state: GameState, playerId: string): number {
  let total = state.players.get(playerId)?.money ?? 0;
  state.properties.forEach((p) => {
    if (p.ownerId !== playerId) return;
    const def = BOARD[p.tile];
    if (!p.mortgaged) total += Math.floor((def.price ?? 0) / 2);
    total += p.houses * Math.floor((def.houseCost ?? 0) / 2);
  });
  return total;
}

export function houseAndHotelCount(state: GameState, playerId: string): { houses: number; hotels: number } {
  let houses = 0, hotels = 0;
  state.properties.forEach((p) => {
    if (p.ownerId !== playerId) return;
    if (p.houses === 5) hotels++;
    else houses += p.houses;
  });
  return { houses, hotels };
}

export const mortgageValue = (tile: number) => Math.floor((BOARD[tile].price ?? 0) / 2);
/**
 * Lifting a mortgage costs the loan plus 10% interest.
 *
 * Written as `* 11 / 10` rather than `* 1.1` because 1.1 has no exact binary
 * representation: 200 * 1.1 evaluates to 220.00000000000003, and rounding that
 * up charges the player an extra pound.
 */
export const unmortgageCost = (tile: number) => Math.ceil((mortgageValue(tile) * 11) / 10);
