/**
 * Pure rule helpers over GameState. No Colyseus messaging in here, so these can be
 * unit tested (and reasoned about) on their own.
 */
import { BOARD, STATION_RENT, tilesInGroup, type ColourGroup } from "../shared/board";
import type { GameState, Player } from "../rooms/schema/GameState";

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

/**
 * Both derive purely from the purchase price, so they sit in shared/board.ts next
 * to it: the title deed cards in the client show these figures, and a second copy
 * over there would be free to drift. Re-exported here so callers of `rules` and
 * the tests are unaffected by the move.
 */
export { mortgageValue, unmortgageCost } from "../shared/board";

/** One side of a proposed trade. */
export interface TradeSide {
  playerId: string;
  tiles: number[];
  money: number;
}

/**
 * Why a proposed trade is illegal, or null if it may go ahead.
 *
 * Called twice for every trade: once when it is proposed, and again when it is
 * accepted. The second check is not redundant — between the two, the proposer
 * may have spent the cash or mortgaged one of the properties involved.
 */
export function tradeError(state: GameState, from: TradeSide, to: TradeSide): string | null {
  const proposer = state.players.get(from.playerId);
  const recipient = state.players.get(to.playerId);

  if (!proposer || !recipient) return "That player is not in this game.";
  if (from.playerId === to.playerId) return "You cannot trade with yourself.";
  if (proposer.bankrupt || recipient.bankrupt) return "That player is out of the game.";

  if (from.tiles.length === 0 && to.tiles.length === 0 &&
      from.money === 0 && to.money === 0) {
    return "A trade has to involve something.";
  }

  for (const side of [from, to]) {
    if (!Number.isInteger(side.money) || side.money < 0) return "Cash amounts must be whole and positive.";
    if (new Set(side.tiles).size !== side.tiles.length) return "The same property is listed twice.";
  }

  if (proposer.money < from.money) return "You do not have that much cash.";
  if (recipient.money < to.money) return `${recipient.name} does not have that much cash.`;

  // `isYou` picks the grammatical person, so the message reads correctly whether
  // it is about the person reading it or about the other player.
  const sideError = (side: TradeSide, owner: Player, isYou: boolean): string | null => {
    const subject = isYou ? "You" : owner.name;
    const doesNotOwn = isYou ? "do not own" : "does not own";
    const mustSell = isYou ? "Sell" : `${owner.name} must sell`;

    for (const tile of side.tiles) {
      const prop = state.properties.get(String(tile));
      if (!prop) return "That square cannot be traded.";
      if (prop.ownerId !== owner.id) return `${subject} ${doesNotOwn} ${BOARD[tile].name}.`;
      // Houses are not transferable: the real rules require selling them to the
      // bank first, and allowing them through would also break the even-build
      // invariant across a colour group that is about to change hands.
      if (prop.houses > 0) return `${mustSell} the houses on ${BOARD[tile].name} first.`;
    }
    return null;
  };

  return sideError(from, proposer, true) ?? sideError(to, recipient, false);
}
