import { Room, Client, CloseCode } from "@colyseus/core";
import { GameState, Player, Property } from "./schema/GameState";
import {
  BOARD, GO_SALARY, JAIL_FINE, JAIL_INDEX, OWNABLE, STARTING_MONEY,
} from "../shared/board";
import type { JoinOptions } from "../shared/messages";
import { CHANCE, COMMUNITY_CHEST, shuffle, type Card, type CardEffects } from "../game/cards";
import {
  buildError, houseAndHotelCount, mortgageValue, netWorth, rentFor, sellError, unmortgageCost,
} from "../game/rules";

const TOKEN_COLOURS = ["#e6394a", "#2f7de1", "#22a95b", "#f0a92a", "#9b4fd1", "#16bcc4"];
const RECONNECT_GRACE_SECONDS = 120;

export class MonopolyRoom extends Room<{ state: GameState }> {
  maxClients = 6;

  /** Server-only. Never added to the schema, so clients cannot read the deck order. */
  private chanceDeck: Card[] = [];
  private chestDeck: Card[] = [];

  onCreate(options: JoinOptions) {
    this.setState(new GameState());
    this.state.roomCode = (options.roomCode ?? "").toUpperCase();

    // NOTE: deliberately NOT setPrivate() — a private room is excluded from matchmaking
    // altogether, so nobody could ever join by room code. The code plus CLASS_PASSCODE
    // is the access control.

    for (const tile of OWNABLE) {
      const p = new Property();
      p.tile = tile;
      this.state.properties.set(String(tile), p);
    }
    this.chanceDeck = shuffle(CHANCE);
    this.chestDeck = shuffle(COMMUNITY_CHEST);

    this.onMessage("start", (client) => this.handleStart(client));
    this.onMessage("roll", (client) => this.handleRoll(client));
    this.onMessage("buy", (client) => this.handleBuy(client));
    this.onMessage("decline", (client) => this.handleDecline(client));
    this.onMessage("endTurn", (client) => this.handleEndTurn(client));
    this.onMessage("payFine", (client) => this.handlePayFine(client));
    this.onMessage("build", (client, msg: { tile: number }) => this.handleBuild(client, msg?.tile));
    this.onMessage("sell", (client, msg: { tile: number }) => this.handleSell(client, msg?.tile));
    this.onMessage("mortgage", (client, msg: { tile: number }) => this.handleMortgage(client, msg?.tile));
    this.onMessage("unmortgage", (client, msg: { tile: number }) => this.handleUnmortgage(client, msg?.tile));
    this.onMessage("declareBankruptcy", (client) => this.handleBankruptcyRequest(client));
  }

  // ---------------------------------------------------------------- join / leave

  onJoin(client: Client, options: JoinOptions) {
    // Passcode is checked here rather than in onAuth so the check does not depend on
    // which Colyseus auth API version is in use.
    const required = process.env.CLASS_PASSCODE;
    if (required && options?.passcode !== required) {
      throw new Error("Wrong passcode.");
    }
    if (this.state.phase !== "lobby") {
      throw new Error("That game has already started.");
    }

    const player = new Player();
    player.id = client.sessionId;
    player.name = (options?.name || "Player").slice(0, 16);
    player.money = STARTING_MONEY;
    player.colour = TOKEN_COLOURS[this.state.players.size % TOKEN_COLOURS.length];
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
    this.log(`${player.name} joined.`);
  }

  async onLeave(client: Client, code?: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // A deliberate leave (tab closed via room.leave()) is not worth holding a seat for.
    const consented = code === CloseCode.CONSENTED;
    if (consented || this.state.phase === "lobby") {
      this.removePlayer(client.sessionId);
      return;
    }

    player.connected = false;
    this.log(`${player.name} disconnected.`);
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
      player.connected = true;
      this.log(`${player.name} reconnected.`);
    } catch {
      this.log(`${player.name} did not come back and is out.`);
      this.bankrupt(player.id, ""); // properties go back to the bank
    }
  }

  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    this.log(`${player.name} left.`);
    this.state.players.delete(sessionId);
    // Hand the host badge to whoever is left.
    if (player.isHost) {
      const next = [...this.state.players.values()][0];
      if (next) next.isHost = true;
    }
  }

  // ---------------------------------------------------------------- guards

  /** Returns the player if it is their turn and the phase is allowed, else null. */
  private requireTurn(client: Client, phases: string[]): Player | null {
    const player = this.state.players.get(client.sessionId);
    if (!player) return null;
    if (this.state.currentPlayerId !== client.sessionId) {
      return this.deny(client, "It is not your turn.");
    }
    if (!phases.includes(this.state.phase)) {
      return this.deny(client, "You cannot do that right now.");
    }
    if (player.bankrupt) return this.deny(client, "You are out of the game.");
    return player;
  }

  private deny(client: Client, message: string): null {
    client.send("error", { message });
    return null;
  }

  // ---------------------------------------------------------------- turn flow

  private handleStart(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost) return this.deny(client, "Only the host can start the game.");
    if (this.state.phase !== "lobby") return this.deny(client, "Already started.");
    if (this.state.players.size < 2) return this.deny(client, "You need at least two players.");

    for (const id of shuffle([...this.state.players.keys()])) this.state.turnOrder.push(id);
    this.state.currentTurn = 0;
    this.state.phase = "rolling";
    this.log(`Game started. ${this.name(this.state.currentPlayerId)} goes first.`);
  }

  private handleRoll(client: Client) {
    const player = this.requireTurn(client, ["rolling"]);
    if (!player) return;
    if (player.money < 0) return this.deny(client, "Settle your debt before rolling.");

    const die1 = 1 + Math.floor(Math.random() * 6);
    const die2 = 1 + Math.floor(Math.random() * 6);
    this.state.die1 = die1;
    this.state.die2 = die2;
    const isDouble = die1 === die2;

    if (player.inJail) {
      if (isDouble) {
        player.inJail = false;
        player.jailTurns = 0;
        this.log(`${player.name} rolled a double and left jail.`);
        this.advancePlayer(player, die1 + die2);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          this.charge(player.id, JAIL_FINE, "");
          player.inJail = false;
          player.jailTurns = 0;
          this.log(`${player.name} paid £${JAIL_FINE} after three failed attempts.`);
          this.advancePlayer(player, die1 + die2);
        } else {
          this.log(`${player.name} failed to roll a double (${die1}+${die2}).`);
          this.state.phase = "acting";
        }
      }
      return;
    }

    if (isDouble) {
      this.state.doubles++;
      if (this.state.doubles >= 3) {
        this.log(`${player.name} rolled three doubles and goes to jail.`);
        this.sendToJail(player);
        this.state.phase = "acting";
        return;
      }
    } else {
      this.state.doubles = 0;
    }

    this.advancePlayer(player, die1 + die2);
  }

  private handleEndTurn(client: Client) {
    const player = this.requireTurn(client, ["acting"]);
    if (!player) return;
    if (player.money < 0) {
      return this.deny(client, "You are in debt — sell, mortgage, or declare bankruptcy.");
    }

    // Rolling a double earns another roll, unless it landed you in jail.
    if (this.state.doubles > 0 && !player.inJail) {
      this.state.phase = "rolling";
      this.log(`${player.name} rolled a double and goes again.`);
      return;
    }
    this.nextTurn();
  }

  private nextTurn() {
    this.state.doubles = 0;
    this.state.pendingPurchase = -1;

    const order = this.state.turnOrder;
    for (let step = 1; step <= order.length; step++) {
      const idx = (this.state.currentTurn + step) % order.length;
      const candidate = this.state.players.get(order[idx]);
      if (candidate && !candidate.bankrupt) {
        this.state.currentTurn = idx;
        this.state.phase = "rolling";
        this.log(`${candidate.name}'s turn.`);
        return;
      }
    }
    this.checkForWinner();
  }

  // ---------------------------------------------------------------- movement

  /** Move `steps` forward, collecting salary on passing GO, then resolve the tile. */
  private advancePlayer(player: Player, steps: number) {
    const target = (player.position + steps) % BOARD.length;
    if (target < player.position) {
      player.money += GO_SALARY;
      this.log(`${player.name} passed GO and collected £${GO_SALARY}.`);
    }
    player.position = target;
    this.resolveTile(player, steps);
  }

  /** Jump straight to a tile (cards), optionally paying salary if GO is passed. */
  private teleport(player: Player, tile: number, collectGo: boolean) {
    if (collectGo && tile < player.position) {
      player.money += GO_SALARY;
      this.log(`${player.name} passed GO and collected £${GO_SALARY}.`);
    }
    player.position = tile;
    this.resolveTile(player, this.state.die1 + this.state.die2);
  }

  private sendToJail(player: Player) {
    player.position = JAIL_INDEX;
    player.inJail = true;
    player.jailTurns = 0;
    this.state.doubles = 0;
  }

  private resolveTile(player: Player, diceTotal: number) {
    const tile = BOARD[player.position];
    this.log(`${player.name} landed on ${tile.name}.`);
    this.state.phase = "acting";

    switch (tile.kind) {
      case "gotojail":
        this.sendToJail(player);
        this.log(`${player.name} was sent to jail.`);
        return;

      case "tax":
        this.charge(player.id, tile.tax ?? 0, "");
        this.log(`${player.name} paid £${tile.tax} in tax.`);
        return;

      case "chance":
        return this.drawCard(player, "chance");

      case "chest":
        return this.drawCard(player, "chest");

      case "street":
      case "station":
      case "utility": {
        const prop = this.state.properties.get(String(player.position))!;
        if (!prop.ownerId) {
          if (player.money >= (tile.price ?? 0)) {
            this.state.pendingPurchase = player.position;
            this.state.phase = "deciding";
          } else {
            this.log(`${player.name} cannot afford ${tile.name}.`);
          }
          return;
        }
        if (prop.ownerId === player.id || prop.mortgaged) return;

        const rent = rentFor(this.state, player.position, diceTotal);
        if (rent > 0) {
          this.charge(player.id, rent, prop.ownerId);
          this.log(`${player.name} paid £${rent} rent to ${this.name(prop.ownerId)}.`);
        }
        return;
      }

      default:
        return; // go, jail (just visiting), free parking
    }
  }

  // ---------------------------------------------------------------- cards

  private drawCard(player: Player, deck: "chance" | "chest") {
    const source = deck === "chance" ? this.chanceDeck : this.chestDeck;
    if (source.length === 0) {
      const refilled = shuffle(deck === "chance" ? CHANCE : COMMUNITY_CHEST);
      if (deck === "chance") this.chanceDeck = refilled;
      else this.chestDeck = refilled;
    }
    const card = (deck === "chance" ? this.chanceDeck : this.chestDeck).shift()!;

    this.broadcast("card", { deck, text: card.text });
    this.log(`${player.name}: ${card.text}`);
    card.effect(this.effectsFor(player));
  }

  private effectsFor(player: Player): CardEffects {
    return {
      moveTo: (tile, collectGo) => this.teleport(player, tile, collectGo),
      moveBy: (delta) => {
        player.position = (player.position + delta + BOARD.length) % BOARD.length;
        this.resolveTile(player, this.state.die1 + this.state.die2);
      },
      gain: (amount) => { player.money += amount; },
      pay: (amount) => this.charge(player.id, amount, ""),
      payEachPlayer: (amount) => {
        this.state.players.forEach((other) => {
          if (other.id !== player.id && !other.bankrupt) this.charge(player.id, amount, other.id);
        });
      },
      collectFromEachPlayer: (amount) => {
        this.state.players.forEach((other) => {
          if (other.id !== player.id && !other.bankrupt) this.charge(other.id, amount, player.id);
        });
      },
      goToJail: () => this.sendToJail(player),
      grantJailCard: () => { player.jailCards++; },
      repairs: (perHouse, perHotel) => {
        const { houses, hotels } = houseAndHotelCount(this.state, player.id);
        this.charge(player.id, houses * perHouse + hotels * perHotel, "");
      },
    };
  }

  // ---------------------------------------------------------------- money

  /**
   * Move money from one player to a creditor ("" = the bank). Balances are allowed to go
   * negative: the debtor then has to raise cash before they can roll or end their turn.
   */
  private charge(debtorId: string, amount: number, creditorId: string) {
    if (amount <= 0) return;
    const debtor = this.state.players.get(debtorId);
    if (!debtor || debtor.bankrupt) return;

    debtor.money -= amount;
    if (creditorId) {
      const creditor = this.state.players.get(creditorId);
      if (creditor) creditor.money += amount;
    }

    if (debtor.money < 0) {
      if (netWorth(this.state, debtorId) < 0) {
        this.log(`${debtor.name} cannot cover £${-debtor.money} and is bankrupt.`);
        this.bankrupt(debtorId, creditorId);
      } else {
        this.log(`${debtor.name} owes £${-debtor.money} and must raise cash.`);
      }
    }
  }

  private bankrupt(playerId: string, creditorId: string) {
    const player = this.state.players.get(playerId);
    if (!player || player.bankrupt) return;
    player.bankrupt = true;
    player.inJail = false;

    // Houses always go back to the bank at half price first.
    this.state.properties.forEach((prop) => {
      if (prop.ownerId !== playerId) return;
      if (prop.houses > 0) {
        player.money += prop.houses * Math.floor((BOARD[prop.tile].houseCost ?? 0) / 2);
        prop.houses = 0;
      }
      prop.ownerId = creditorId; // "" hands it back to the bank
      if (creditorId) prop.mortgaged = prop.mortgaged; // mortgages carry over to the new owner
      else prop.mortgaged = false;
    });

    const creditor = creditorId ? this.state.players.get(creditorId) : undefined;
    if (creditor && player.money > 0) creditor.money += player.money;
    player.money = 0;
    this.log(`${player.name} is out of the game.`);

    if (this.state.currentPlayerId === playerId) this.nextTurn();
    else this.checkForWinner();
  }

  private checkForWinner() {
    const alive = [...this.state.players.values()].filter((p) => !p.bankrupt);
    if (alive.length === 1 && this.state.phase !== "lobby") {
      this.state.phase = "ended";
      this.state.winnerId = alive[0].id;
      this.log(`${alive[0].name} wins.`);
    }
  }

  // ---------------------------------------------------------------- player actions

  private handleBuy(client: Client) {
    const player = this.requireTurn(client, ["deciding"]);
    if (!player) return;
    const tile = this.state.pendingPurchase;
    const def = BOARD[tile];
    const prop = this.state.properties.get(String(tile));
    if (tile < 0 || !prop || prop.ownerId) return this.deny(client, "Nothing to buy.");
    if (player.money < (def.price ?? 0)) return this.deny(client, "You cannot afford that.");

    player.money -= def.price ?? 0;
    prop.ownerId = player.id;
    this.state.pendingPurchase = -1;
    this.state.phase = "acting";
    this.log(`${player.name} bought ${def.name} for £${def.price}.`);
  }

  private handleDecline(client: Client) {
    const player = this.requireTurn(client, ["deciding"]);
    if (!player) return;
    // No auction implemented yet: the property simply stays with the bank.
    this.log(`${player.name} declined ${BOARD[this.state.pendingPurchase]?.name}.`);
    this.state.pendingPurchase = -1;
    this.state.phase = "acting";
  }

  private handlePayFine(client: Client) {
    const player = this.requireTurn(client, ["rolling"]);
    if (!player) return;
    if (!player.inJail) return this.deny(client, "You are not in jail.");

    if (player.jailCards > 0) {
      player.jailCards--;
      this.log(`${player.name} used a Get Out of Jail Free card.`);
    } else {
      if (player.money < JAIL_FINE) return this.deny(client, "You cannot afford the fine.");
      this.charge(player.id, JAIL_FINE, "");
      this.log(`${player.name} paid the £${JAIL_FINE} fine.`);
    }
    player.inJail = false;
    player.jailTurns = 0;
  }

  private handleBuild(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const error = buildError(this.state, player.id, tile);
    if (error) return this.deny(client, error);

    const prop = this.state.properties.get(String(tile))!;
    player.money -= BOARD[tile].houseCost ?? 0;
    prop.houses++;
    this.log(`${player.name} built on ${BOARD[tile].name} (now ${prop.houses === 5 ? "a hotel" : prop.houses + " house(s)"}).`);
  }

  private handleSell(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const error = sellError(this.state, player.id, tile);
    if (error) return this.deny(client, error);

    const prop = this.state.properties.get(String(tile))!;
    prop.houses--;
    player.money += Math.floor((BOARD[tile].houseCost ?? 0) / 2);
    this.log(`${player.name} sold a house on ${BOARD[tile].name}.`);
  }

  private handleMortgage(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    const prop = this.state.properties.get(String(tile));
    if (!player || !prop) return;
    if (prop.ownerId !== player.id) return this.deny(client, "You do not own that.");
    if (prop.mortgaged) return this.deny(client, "Already mortgaged.");
    if (prop.houses > 0) return this.deny(client, "Sell the houses first.");

    prop.mortgaged = true;
    player.money += mortgageValue(tile);
    this.log(`${player.name} mortgaged ${BOARD[tile].name} for £${mortgageValue(tile)}.`);
  }

  private handleUnmortgage(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    const prop = this.state.properties.get(String(tile));
    if (!player || !prop) return;
    if (prop.ownerId !== player.id) return this.deny(client, "You do not own that.");
    if (!prop.mortgaged) return this.deny(client, "That is not mortgaged.");
    const cost = unmortgageCost(tile);
    if (player.money < cost) return this.deny(client, "You cannot afford to lift the mortgage.");

    prop.mortgaged = false;
    player.money -= cost;
    this.log(`${player.name} lifted the mortgage on ${BOARD[tile].name} for £${cost}.`);
  }

  private handleBankruptcyRequest(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.bankrupt) return;
    if (player.money >= 0) return this.deny(client, "You are not in debt.");
    this.bankrupt(player.id, "");
  }

  // ---------------------------------------------------------------- helpers

  private name(id: string): string {
    return this.state.players.get(id)?.name ?? "the bank";
  }

  private log(line: string) {
    this.state.log.push(line);
    while (this.state.log.length > 40) this.state.log.shift();
  }
}
