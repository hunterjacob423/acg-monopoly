/**
 * Chance and Community Chest decks. Deliberately NOT part of the synced schema:
 * clients must never be able to read the upcoming card order.
 */
import { BOARD, GO_SALARY, JAIL_INDEX } from "../shared/board";

/**
 * A square's current name, so the cards that send you somewhere follow the board
 * when it is re-themed in `shared/locations.ts`. Hardcoding "Advance to Mayfair"
 * would leave the deck naming a square that no longer exists.
 */
const at = (tile: number) => BOARD[tile].name;

export interface Card {
  text: string;
  /** Mutates the game via the effects object the room passes in. */
  effect: (fx: CardEffects) => void;
}

export interface CardEffects {
  /** Move to a tile, collecting salary if GO is passed. */
  moveTo(tile: number, collectGo: boolean): void;
  /** Move forward/back a number of tiles. */
  moveBy(delta: number): void;
  gain(amount: number): void;
  pay(amount: number): void;
  /** Pay every other solvent player this amount. */
  payEachPlayer(amount: number): void;
  collectFromEachPlayer(amount: number): void;
  goToJail(): void;
  grantJailCard(): void;
  /** Per house and per hotel owned. */
  repairs(perHouse: number, perHotel: number): void;
}

export const CHANCE: Card[] = [
  { text: `Advance to ${at(0)}. Collect £200.`, effect: (f) => f.moveTo(0, true) },
  { text: `Advance to ${at(39)}.`, effect: (f) => f.moveTo(39, true) },
  { text: `Advance to ${at(24)}. If you pass GO, collect £200.`, effect: (f) => f.moveTo(24, true) },
  { text: `Advance to ${at(11)}. If you pass GO, collect £200.`, effect: (f) => f.moveTo(11, true) },
  { text: `Advance to ${at(15)}. If you pass GO, collect £200.`, effect: (f) => f.moveTo(15, true) },
  { text: "Go back three spaces.", effect: (f) => f.moveBy(-3) },
  { text: "Go to Jail. Do not pass GO, do not collect £200.", effect: (f) => f.goToJail() },
  { text: "Get out of Jail free.", effect: (f) => f.grantJailCard() },
  { text: "Your building loan matures. Collect £150.", effect: (f) => f.gain(150) },
  { text: "Bank pays you dividend of £50.", effect: (f) => f.gain(50) },
  { text: "You have won a crossword competition. Collect £100.", effect: (f) => f.gain(100) },
  { text: "Speeding fine. Pay £15.", effect: (f) => f.pay(15) },
  { text: "Pay school fees of £150.", effect: (f) => f.pay(150) },
  { text: "Make general repairs on all your property: £25 per house, £100 per hotel.", effect: (f) => f.repairs(25, 100) },
  { text: "You have been elected Chairman of the Board. Pay each player £50.", effect: (f) => f.payEachPlayer(50) },
  { text: "Drunk in charge. Fine £20.", effect: (f) => f.pay(20) },
];

export const COMMUNITY_CHEST: Card[] = [
  { text: `Advance to ${at(0)}. Collect £200.`, effect: (f) => f.moveTo(0, true) },
  { text: "Bank error in your favour. Collect £200.", effect: (f) => f.gain(GO_SALARY) },
  { text: "Doctor's fee. Pay £50.", effect: (f) => f.pay(50) },
  { text: "From sale of stock you get £50.", effect: (f) => f.gain(50) },
  { text: "Get out of Jail free.", effect: (f) => f.grantJailCard() },
  { text: "Go to Jail. Do not pass GO, do not collect £200.", effect: (f) => f.goToJail() },
  { text: "It is your birthday. Collect £10 from every player.", effect: (f) => f.collectFromEachPlayer(10) },
  { text: "Annuity matures. Collect £100.", effect: (f) => f.gain(100) },
  { text: "You inherit £100.", effect: (f) => f.gain(100) },
  { text: "Pay hospital fees of £100.", effect: (f) => f.pay(100) },
  { text: "Pay school fees of £50.", effect: (f) => f.pay(50) },
  { text: "Receive £25 consultancy fee.", effect: (f) => f.gain(25) },
  { text: "You are assessed for street repairs: £40 per house, £115 per hotel.", effect: (f) => f.repairs(40, 115) },
  { text: "You have won second prize in a beauty contest. Collect £10.", effect: (f) => f.gain(10) },
  { text: "Income tax refund. Collect £20.", effect: (f) => f.gain(20) },
  { text: "Visiting time at the jail is over.", effect: (f) => f.moveTo(JAIL_INDEX, false) },
];

/** Fisher-Yates. Decks are reshuffled when exhausted. */
export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
