import test from "node:test";
import assert from "node:assert/strict";
import { GameState, Player, Property } from "../rooms/schema/GameState";
import { OWNABLE, tilesInGroup } from "../shared/board";
import {
  buildError, sellError, rentFor, netWorth, countOwned, ownsWholeGroup,
  mortgageValue, unmortgageCost,
} from "./rules";

/** A game state with the given players, all 28 properties owned by the bank. */
function makeState(...names: string[]): GameState {
  const state = new GameState();
  names.forEach((name, i) => {
    const p = new Player();
    p.id = `p${i}`;
    p.name = name;
    p.money = 1500;
    state.players.set(p.id, p);
  });
  for (const tile of OWNABLE) {
    const prop = new Property();
    prop.tile = tile;
    state.properties.set(String(tile), prop);
  }
  return state;
}

const give = (state: GameState, tiles: number[], ownerId: string) => {
  for (const t of tiles) state.properties.get(String(t))!.ownerId = ownerId;
};

const BROWN = tilesInGroup("brown");        // Old Kent Road (1), Whitechapel (3)
const LIGHTBLUE = tilesInGroup("lightblue"); // 6, 8, 9

test("rent: an unowned property costs nothing", () => {
  const state = makeState("A", "B");
  assert.equal(rentFor(state, 1, 7), 0);
});

test("rent: a single street charges the base rate", () => {
  const state = makeState("A", "B");
  give(state, [1], "p0");
  assert.equal(rentFor(state, 1, 7), 2); // Old Kent Road base rent
});

test("rent: an undeveloped street in a COMPLETE group pays double", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  assert.equal(ownsWholeGroup(state, "p0", "brown"), true);
  assert.equal(rentFor(state, 1, 7), 4);  // 2 doubled
  assert.equal(rentFor(state, 3, 7), 8);  // 4 doubled
});

test("rent: a mortgaged property collects nothing", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.properties.get("1")!.mortgaged = true;
  assert.equal(rentFor(state, 1, 7), 0);
});

test("rent: houses and hotels use the printed rent table", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  const prop = state.properties.get("1")!;
  const expected = [4, 10, 30, 90, 160, 250]; // index 0 is the doubled base rate
  for (let houses = 0; houses <= 5; houses++) {
    prop.houses = houses;
    assert.equal(rentFor(state, 1, 7), expected[houses], `${houses} houses`);
  }
});

test("rent: stations scale with how many you own", () => {
  const state = makeState("A", "B");
  const stations = [5, 15, 25, 35];
  for (let owned = 1; owned <= 4; owned++) {
    const s = makeState("A", "B");
    give(s, stations.slice(0, owned), "p0");
    assert.equal(countOwned(s, "p0", "station"), owned);
    assert.equal(rentFor(s, 5, 7), [25, 50, 100, 200][owned - 1]);
  }
  assert.equal(rentFor(state, 5, 7), 0); // unowned
});

test("rent: utilities multiply the dice roll by 4, or 10 for both", () => {
  const one = makeState("A", "B");
  give(one, [12], "p0");
  assert.equal(rentFor(one, 12, 9), 36);   // 9 x 4

  const both = makeState("A", "B");
  give(both, [12, 28], "p0");
  assert.equal(rentFor(both, 12, 9), 90);  // 9 x 10
});

test("build: refused without the whole colour group", () => {
  const state = makeState("A", "B");
  give(state, [1], "p0"); // only one of the two browns
  assert.equal(buildError(state, "p0", 1), "You need the whole colour group first.");
});

test("build: ALLOWED once the group is complete and affordable", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  assert.equal(buildError(state, "p0", 1), null);
});

test("build: refused on a street you do not own", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  assert.equal(buildError(state, "p1", 1), "You do not own that street.");
});

test("build: refused on stations and utilities", () => {
  const state = makeState("A", "B");
  give(state, [5, 12], "p0");
  assert.equal(buildError(state, "p0", 5), "You cannot build there.");
  assert.equal(buildError(state, "p0", 12), "You cannot build there.");
});

test("build: houses must go on evenly across the group", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.properties.get("1")!.houses = 1;
  // Old Kent Road is now ahead of Whitechapel, so it may not take a second.
  assert.equal(buildError(state, "p0", 1), "Houses must be built evenly across the group.");
  assert.equal(buildError(state, "p0", 3), null); // the other one is fine
});

test("build: refused when a street in the group is mortgaged", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.properties.get("3")!.mortgaged = true;
  assert.equal(buildError(state, "p0", 1),
    "You cannot build while a street in the group is mortgaged.");
});

test("build: refused when you cannot afford the house", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.players.get("p0")!.money = 10; // a brown house costs 50
  assert.equal(buildError(state, "p0", 1), "You cannot afford that house.");
});

test("build: refused once a hotel is standing", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  BROWN.forEach((t) => { state.properties.get(String(t))!.houses = 5; });
  assert.equal(buildError(state, "p0", 1), "That street already has a hotel.");
});

test("build: a full group can be developed all the way to hotels", () => {
  const state = makeState("A", "B");
  give(state, LIGHTBLUE, "p0");
  state.players.get("p0")!.money = 10_000;
  // Build evenly, one round at a time, exactly as the rules require.
  for (let round = 0; round < 5; round++) {
    for (const tile of LIGHTBLUE) {
      assert.equal(buildError(state, "p0", tile), null, `round ${round}, tile ${tile}`);
      state.properties.get(String(tile))!.houses++;
    }
  }
  assert.equal(state.properties.get(String(LIGHTBLUE[0]))!.houses, 5);
  assert.equal(rentFor(state, LIGHTBLUE[0], 7), 550); // Angel Islington hotel rent
});

test("sell: houses must come off evenly, highest first", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.properties.get("1")!.houses = 2;
  state.properties.get("3")!.houses = 1;
  assert.equal(sellError(state, "p0", 3), "Houses must be sold evenly across the group.");
  assert.equal(sellError(state, "p0", 1), null);
});

test("sell: nothing to sell on a bare street", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  assert.equal(sellError(state, "p0", 1), "There are no houses to sell.");
});

test("mortgage values are half price, and cost 10% interest to lift", () => {
  assert.equal(mortgageValue(1), 30);        // Old Kent Road, £60
  assert.equal(unmortgageCost(1), 33);       // 30 + 10%
  assert.equal(mortgageValue(39), 200);      // Mayfair, £400
  assert.equal(unmortgageCost(39), 220);
});

test("netWorth counts cash, half of property value, and half of houses", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.players.get("p0")!.money = 100;
  state.properties.get("1")!.houses = 2;
  // 100 cash + (30 + 30) mortgage value + (2 houses x 25) = 210
  assert.equal(netWorth(state, "p0"), 210);
});

test("netWorth ignores a mortgaged property's sale value", () => {
  const state = makeState("A", "B");
  give(state, BROWN, "p0");
  state.players.get("p0")!.money = 0;
  state.properties.get("1")!.mortgaged = true;
  assert.equal(netWorth(state, "p0"), 30); // only Whitechapel still counts
});
