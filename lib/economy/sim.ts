// =============================================================================
//  Lantern Lane fast-forward simulator.
//
//  Plays a week on the Lane with simulated Beasts, using the real rules:
//  prices from pricing.ts, events from events.ts, $YARN from yarn.ts.
//  Deterministic: the same seed always plays the same week.
//
//  Usage:
//    for (const snap of simulateWeek({ seed: 7 })) render(snap);
//
//  Each night yields `stepsPerNight` snapshots (step 0..stepsPerNight-1) while
//  Beasts prowl and trade, then one closing snapshot (step === stepsPerNight)
//  after close_night and the $YARN settlement.
//
//  What a judge should see with the default seed and "steady" scenario:
//    night 1  good night, YARN minted; Old Tom's till runs dry, he loses a lantern
//    night 2  a storm keeps Beasts home: the alley misses, 5% of the treasury burns
//    night 3  Tom on his LAST LANTERN (sells cheap), then goes dark at close
//    night 4  Tom closed (others lowball fish) until investors relight him;
//             the streak is one good night from the record, so Tom pays double
//    night 5  Moon Festival: everyone pays +50%, daring runs find moonstones
//    night 6-7 Tom's till drains again; he is back on his last lantern and goes dark at the end of night 7
// =============================================================================

import type { Item } from "@/lib/chain/types";
import { detectEvents, EVENT_EFFECTS, type EventKind, type NightStats } from "./events";
import {
  BANDIT_STOLEN_GOODS_REP_COST,
  BASE_STALL_RENT,
  ITEM_HOME,
  MERCHANT_IDS,
  MERCHANTS,
  marketFee,
  nextStallRent,
  quotePrice,
  STALL_SLOTS,
  type MerchantId,
  type PricingInput,
} from "./pricing";
import { nightlyRequests, type MerchantRequest } from "./requests";
import { makeRng, type Rng } from "./rng";
import { depositToTreasury, initialYarnState, recordWithinReach, settleNight, type YarnSimState } from "./yarn";

export type SimScenario = "steady" | "fading" | "weekend";

export type SimOptions = {
  seed?: number;
  nights?: number;
  stepsPerNight?: number;
  beasts?: number;
  scenario?: SimScenario;
};

export type SimSnapshot = {
  night: number;
  /** 0..stepsPerNight-1 during the night; stepsPerNight = after close & settlement. */
  step: number;
  /** What each merchant PAYS a Beast for one unit right now (Beast sells). 0/absent = won't buy. */
  prices: Record<MerchantId, Partial<Record<Item, number>>>;
  /** What each merchant CHARGES a Beast for one unit right now (Beast buys). */
  buyPrices: Record<MerchantId, Partial<Record<Item, number>>>;
  /** The merchant's own words on their headline price. */
  reasoning: Record<MerchantId, string>;
  merchants: { id: MerchantId; till: number; lanterns: number; open: boolean; stock: Partial<Record<Item, number>> }[];
  yarn: { supply: number; treasury: number; streak: number; lives: number; longest: number };
  events: { kind: EventKind; text: string }[];
  /** What happened during this step, newest last. */
  feed: string[];
};

export const DEFAULT_SIM_SEED = 7;

// ---- Tunables ----------------------------------------------------------------

/** A merchant whose till is below this at close loses a lantern. */
const EMPTY_TILL = 5;
/** Lanterns and YARN investors put in to relight a closed stall. */
const REVIVE_LANTERNS = 3;
const REVIVE_YARN = 90;
/** Overnight, townsfolk buy this many units off each merchant at base price. */
const TOWNSFOLK_DEMAND: Partial<Record<Item, number>> = { fish: 6, button: 7, bell: 5, moonstone: 2, catnip: 4 };
/** Share of Tom's ice box that spoils overnight. */
const FISH_SPOILAGE = 0.25;
/** Clove crafts this many charms overnight. */
const CHARMS_CRAFTED = 6;

/** Share of Beasts that come out to prowl each night, per scenario. */
function participation(scenario: SimScenario, night: number): number {
  switch (scenario) {
    case "steady":
      return night === 2 ? 0.4 : 0.85; // night 2: a storm keeps most Beasts in
    case "fading":
      return Math.max(0.3, 0.9 - 0.08 * (night - 1));
    case "weekend":
      return night % 7 === 6 || night % 7 === 0 ? 0.45 : 0.85;
  }
}

const BEAST_NAMES = [
  "Pip", "Mochi", "Inky", "Biscuit", "Saffron", "Tofu", "Juniper", "Pebble",
  "Clementine", "Wasabi", "Nutmeg", "Ziggy", "Marmalade", "Soot", "Kipper", "Bramble",
  "Luna", "Pickle", "Dumpling", "Sprout", "Velvet", "Tansy", "Noodle", "Ember",
];

// ---- World state -------------------------------------------------------------

type MerchantState = {
  id: MerchantId;
  till: number;
  lanterns: number;
  open: boolean;
  stock: Partial<Record<Item, number>>;
  soldTonight: Partial<Record<Item, number>>;
};

type BeastState = {
  name: string;
  lives: number;
  yarn: number;
  inventory: Partial<Record<Item, number>>;
  /** Goods whipped off an awning, keyed by the merchant they came from. */
  hot: { item: Item; from: MerchantId }[];
  rep: Record<MerchantId, number>;
  visits: Record<MerchantId, number>;
};

type World = {
  rng: Rng;
  merchants: Record<MerchantId, MerchantState>;
  beasts: BeastState[];
  yarn: YarnSimState;
  yarnBaseline: number;
  history: NightStats[];
  events: { kind: EventKind; text: string; merchant?: MerchantId }[];
  stallRent: number;
  stallsFilled: number;
  /** Merchants that went dark, and the night they did. */
  closedOn: Partial<Record<MerchantId, number>>;
  // Tonight's counters.
  falls: number;
  daringRuns: number;
  thievesCaught: number;
  thievesEscaped: number;
  tuggers: Set<number>;
  festivalTomorrow: boolean;
  /** Bad weather tonight: few Beasts out, daring runs fall far more often. */
  storm: boolean;
  /** YARN in the wallets of townsfolk (players not simulated) who shop overnight. */
  townsfolk: number;
  /** Tonight's notice board, posted at dusk (requests.ts). */
  requests: MerchantRequest[];
};

const add = (bag: Partial<Record<Item, number>>, item: Item, n: number) => {
  bag[item] = (bag[item] ?? 0) + n;
};

function openMerchants(w: World): MerchantId[] {
  return MERCHANT_IDS.filter((id) => w.merchants[id].open);
}

function yarnSupply(w: World): number {
  return w.yarn.total_supply;
}

function priceInput(w: World, merchant: MerchantId, side: "sell" | "buy", item: Item, amount: number, beast?: BeastState): PricingInput {
  const m = w.merchants[merchant];
  const last = w.history[w.history.length - 1];
  return {
    merchant,
    side,
    item,
    amount,
    beastName: beast?.name,
    reputation: beast?.rep[merchant] ?? 0,
    merchantStock: m.stock,
    capacity: MERCHANTS[merchant].capacity,
    till: m.till,
    lanterns: m.lanterns,
    openMerchants: openMerchants(w),
    soldTonight: m.soldTonight,
    yarnSupply: yarnSupply(w),
    yarnBaseline: w.yarnBaseline,
    festivalTomorrow: w.festivalTomorrow,
    festivalTonight: w.yarn.festival,
    fallsLastNight: last?.falls ?? 0,
    daringRunsLastNight: last?.daringRuns ?? 0,
    activeEvents: w.events.map((e) => e.kind),
    regularVisits: beast?.visits[merchant],
    requestRemaining: requestRemaining(w, merchant, item),
  };
}

/** Units still wanted by tonight's request (sized at dusk, counted down by tonight's sales). */
function requestRemaining(w: World, merchant: MerchantId, item: Item): number {
  if (merchant === "clove") return 0;
  const r = w.requests.find((x) => x.merchant === merchant && x.kind === "want" && x.item === item);
  return r ? Math.max(0, r.wanted - (w.merchants[merchant].soldTonight[item] ?? 0)) : 0;
}

/** Move YARN from a payer to the treasury as the 2% market fee. */
function chargeFee(w: World, total: number): number {
  const fee = marketFee(total);
  w.yarn = depositToTreasury(w.yarn, fee);
  return fee;
}

// ---- One Beast's turn ------------------------------------------------------------

function prowl(w: World, idx: number, feed: string[]): void {
  const { rng } = w;
  const b = w.beasts[idx];
  const swarm = w.events.some((e) => e.kind === "rat_swarm");
  const storm = w.storm;

  // Lives low? Get a boop first (+1 life, counts as a tug).
  if (b.lives < 9 && rng.chance(0.5)) {
    b.lives += 1;
    w.tuggers.add(idx);
  }
  if (b.lives <= 0) {
    feed.push(`${b.name} is too tired to prowl (no lives lit).`);
    return;
  }

  const daring = rng.chance(0.4);
  const rooftops = daring ? rng.int(3, 6) : rng.int(1, 3);
  const haul: Item[] = [];
  for (let r = 0; r < rooftops; r++) {
    const roll = rng.next();
    if (daring) haul.push(roll < 0.35 ? "fish" : roll < 0.55 ? "button" : roll < 0.8 ? "bell" : roll < 0.92 ? "catnip" : "moonstone");
    else haul.push(roll < 0.6 ? "fish" : roll < 0.85 ? "button" : "catnip");
  }
  if (daring && w.yarn.festival) {
    for (let k = 0; k < EVENT_EFFECTS.festivalExtraMoonstones; k++) haul.push("moonstone");
  }

  // Daring runs can fall. A Lucky Charm takes the fall instead.
  let fell = false;
  if (daring) {
    w.daringRuns += 1;
    fell = rng.chance(storm ? 0.65 : 0.25);
  }
  w.tuggers.add(idx); // every finished run tugs the yarn

  if (fell) {
    w.falls += 1;
    if ((b.inventory.charm ?? 0) > 0) {
      b.inventory.charm = (b.inventory.charm ?? 0) - 1;
      feed.push(`${b.name} slipped on a daring run, but a Lucky Charm caught the fall.`);
    } else {
      b.lives -= 1;
      feed.push(`${b.name} fell from a rooftop and lost a life (${b.lives} left), dropping the haul.`);
      return;
    }
  }

  for (const item of haul) add(b.inventory, item, 1);
  feed.push(`${b.name} ${daring ? "dared" : "padded"} across ${rooftops} rooftop${rooftops === 1 ? "" : "s"}: ${summarize(haul)}.`);

  // Mischief: daring Beasts sometimes whip goods off an awning.
  if (daring && rng.chance(0.2)) {
    const victimId = rng.pick(openMerchants(w).length > 0 ? openMerchants(w) : MERCHANT_IDS);
    const victim = w.merchants[victimId];
    const item = MERCHANTS[victimId].trades[0];
    if ((victim.stock[item] ?? 0) > 0) {
      add(victim.stock, item, -1);
      b.hot.push({ item, from: victimId });
      b.rep[victimId] -= 15;
      feed.push(`${b.name} whipped a ${item} off ${MERCHANTS[victimId].name}'s awning. ${MERCHANTS[victimId].name} won't forget.`);
    }
  }

  // Rat thieves: bind them for a bounty and goodwill, or they rob a stall.
  const thieves = rng.chance(swarm ? 0.9 : 0.45) ? (swarm ? EVENT_EFFECTS.ratSwarmThieves : 1) : 0;
  for (let t = 0; t < thieves; t++) {
    const targetId = rng.pick(openMerchants(w).length > 0 ? openMerchants(w) : MERCHANT_IDS);
    const target = w.merchants[targetId];
    if (rng.chance(0.55)) {
      w.thievesCaught += 1;
      const bounty = Math.min(target.till, 2 * (swarm ? EVENT_EFFECTS.ratSwarmBindPay : 1));
      target.till -= bounty;
      b.yarn += bounty;
      b.rep[targetId] += 8;
      feed.push(`${b.name} bound a rat thief at ${MERCHANTS[targetId].name}'s stall (+${bounty} YARN, +rep).`);
    } else {
      w.thievesEscaped += 1;
      const item = MERCHANTS[targetId].trades[0];
      if ((target.stock[item] ?? 0) > 0) add(target.stock, item, -1);
    }
  }

  trade(w, idx, feed);
}

function summarize(haul: Item[]): string {
  const counts: Partial<Record<Item, number>> = {};
  for (const i of haul) add(counts, i, 1);
  return Object.entries(counts).map(([i, n]) => `${n} ${i}`).join(", ") || "nothing";
}

function trade(w: World, idx: number, feed: string[]): void {
  const b = w.beasts[idx];

  // Sell hot goods to Bandit (it costs reputation with the merchant they came from).
  if (b.hot.length > 0 && w.merchants.bandit.open) {
    for (const h of [...b.hot]) {
      const q = quotePrice({ ...priceInput(w, "bandit", "sell", h.item, 1, b), stolen: true });
      if (q.price_per <= 0) break;
      pay(w, "bandit", b, "sell", h.item, 1, q.price_per);
      b.hot.splice(b.hot.indexOf(h), 1);
      b.rep[h.from] -= BANDIT_STOLEN_GOODS_REP_COST;
      feed.push(`${b.name} fenced a hot ${h.item} to Bandit for ${q.price_per} YARN. "${q.reasoning}"`);
    }
  }

  // Sell everything except charms to whoever pays best.
  for (const item of Object.keys(b.inventory) as Item[]) {
    const have = b.inventory[item] ?? 0;
    if (item === "charm" || have <= 0) continue;
    let best: { id: MerchantId; price: number; reasoning: string } | null = null;
    for (const id of openMerchants(w)) {
      const q = quotePrice(priceInput(w, id, "sell", item, 1, b));
      if (q.price_per > 0 && (best === null || q.price_per > best.price)) best = { id, price: q.price_per, reasoning: q.reasoning };
    }
    if (best === null) continue;
    // Re-quote for the whole lot (the till may not stretch that far).
    let amount = have;
    let q = quotePrice(priceInput(w, best.id, "sell", item, amount, b));
    while (q.price_per <= 0 && amount > 1) {
      amount -= 1;
      q = quotePrice(priceInput(w, best.id, "sell", item, amount, b));
    }
    if (q.price_per <= 0) continue;
    pay(w, best.id, b, "sell", item, amount, q.price_per);
    if (ITEM_HOME[item] !== best.id || item === "fish" || item === "moonstone") {
      feed.push(`${b.name} sold ${amount} ${item} to ${MERCHANTS[best.id].name} at ${q.price_per} each. "${q.reasoning}"`);
    }
  }

  // No charm? Buy one from Sister Clove if it's affordable.
  if ((b.inventory.charm ?? 0) === 0 && w.merchants.clove.open && w.rng.chance(0.5)) {
    const q = quotePrice(priceInput(w, "clove", "buy", "charm", 1, b));
    if (q.price_per > 0 && b.yarn >= q.price_per) {
      pay(w, "clove", b, "buy", "charm", 1, q.price_per);
      feed.push(`${b.name} bought a Lucky Charm for ${q.price_per} YARN. "${q.reasoning}"`);
    }
  }
}

/** Settle a trade: YARN and goods change paws, 2% goes to the treasury. */
function pay(w: World, id: MerchantId, b: BeastState, side: "sell" | "buy", item: Item, amount: number, pricePer: number): void {
  const m = w.merchants[id];
  const total = pricePer * amount;
  if (side === "sell") {
    m.till -= total;
    const fee = chargeFee(w, total);
    b.yarn += total - fee;
    add(b.inventory, item, -amount);
    add(m.stock, item, amount);
    add(m.soldTonight, item, amount);
  } else {
    b.yarn -= total;
    const fee = chargeFee(w, total);
    m.till += total - fee;
    add(b.inventory, item, amount);
    add(m.stock, item, -amount);
  }
  b.visits[id] += 1;
}

// ---- Close of night ----------------------------------------------------------------

function closeNight(w: World, night: number, feed: string[]): void {
  // Stalls pay rent into the treasury; rent drifts with demand.
  let rentPaid = 0;
  for (let s = 0; s < w.stallsFilled; s++) {
    const holder = w.beasts[s % w.beasts.length];
    if (holder.yarn >= w.stallRent) {
      holder.yarn -= w.stallRent;
      rentPaid += w.stallRent;
    }
  }
  w.yarn = depositToTreasury(w.yarn, rentPaid);
  const newRent = nextStallRent(w.stallRent, w.stallsFilled);
  feed.push(`${w.stallsFilled}/${STALL_SLOTS} stalls paid ${rentPaid} YARN rent.${newRent !== w.stallRent ? ` Rent moves ${w.stallRent} -> ${newRent}.` : ""}`);
  w.stallRent = newRent;
  // Beasts give up stalls when rent gets steep, and come back when it's cheap.
  const drift = w.stallRent >= 8 ? -w.rng.int(1, 2) : w.rng.int(0, 1);
  w.stallsFilled = Math.min(STALL_SLOTS, Math.max(4, w.stallsFilled + drift));

  // close_night: a merchant with an empty till loses a lantern.
  for (const id of MERCHANT_IDS) {
    const m = w.merchants[id];
    if (m.open && m.till < EMPTY_TILL) {
      m.lanterns -= 1;
      if (m.lanterns <= 0) {
        m.open = false;
        w.closedOn[id] = night;
        feed.push(`${MERCHANTS[id].name}'s last lantern gutters out. The stall goes dark.`);
      } else {
        feed.push(`${MERCHANTS[id].name}'s till is empty: a lantern goes out (${m.lanterns} left).`);
      }
    }
  }

  // Overnight: townsfolk buy from open stalls (tills refill); Clove crafts charms.
  for (const id of openMerchants(w)) {
    const m = w.merchants[id];
    for (const item of MERCHANTS[id].trades) {
      const price = MERCHANTS[id].basePrice[item] ?? 0;
      const n = Math.min(m.stock[item] ?? 0, TOWNSFOLK_DEMAND[item] ?? 0, price > 0 ? Math.floor(w.townsfolk / price) : 0);
      add(m.stock, item, -n);
      m.till += n * price;
      w.townsfolk -= n * price;
    }
    m.soldTonight = {};
  }
  if (w.merchants.clove.open) {
    const charms = w.merchants.clove.stock.charm ?? 0;
    w.merchants.clove.stock.charm = Math.min(MERCHANTS.clove.capacity.charm ?? charms, charms + CHARMS_CRAFTED);
  }
  const fish = w.merchants.tom.stock.fish ?? 0;
  w.merchants.tom.stock.fish = fish - Math.floor(fish * FISH_SPOILAGE);

  // $YARN settles.
  const before = w.yarn;
  const { state, outcome } = settleNight(w.yarn, w.tuggers.size, w.beasts.length);
  w.yarn = state;
  if (outcome.hit) {
    for (const idx of w.tuggers) w.beasts[idx].yarn += 10;
    feed.push(`Good night! ${outcome.tugs}/${outcome.registered} Beasts tugged (needed ${outcome.target}). ${outcome.minted} YARN minted. Streak ${state.streak}.`);
    if (outcome.lifeBack) feed.push(`Seven good nights in a row: the alley wins a life back (${state.lives}/9).`);
    if (outcome.recordBroken) feed.push(`The Longest Night is broken (${state.streak} > ${before.record})! Moon Festival tomorrow.`);
  } else {
    feed.push(`Missed night: only ${outcome.tugs}/${outcome.registered} tugged (needed ${outcome.target}). The alley loses a life (${state.lives}/9) and ${outcome.burned} YARN burns from the treasury.`);
    if (outcome.reset) feed.push(`The alley ran out of lives. Streak resets to 0; nine fresh lives.`);
  }

  w.history.push({
    night,
    tomFishStock: w.merchants.tom.stock.fish ?? 0,
    tomFishCapacity: MERCHANTS.tom.capacity.fish ?? 0,
    thievesEscaped: w.thievesEscaped,
    thievesCaught: w.thievesCaught,
    daringRuns: w.daringRuns,
    falls: w.falls,
    merchantLanterns: {
      tom: w.merchants.tom.lanterns,
      miso: w.merchants.miso.lanterns,
      bandit: w.merchants.bandit.lanterns,
      clove: w.merchants.clove.lanterns,
    },
    recordBroken: outcome.recordBroken,
  });
}

// ---- Snapshots -----------------------------------------------------------------

const HEADLINE: Record<MerchantId, { item: Item; side: "sell" | "buy" }> = {
  tom: { item: "fish", side: "sell" },
  miso: { item: "button", side: "sell" },
  bandit: { item: "moonstone", side: "sell" },
  clove: { item: "charm", side: "buy" },
};

function snapshot(w: World, night: number, step: number, feed: string[]): SimSnapshot {
  const prices = {} as Record<MerchantId, Partial<Record<Item, number>>>;
  const buyPrices = {} as Record<MerchantId, Partial<Record<Item, number>>>;
  const reasoning = {} as Record<MerchantId, string>;
  const items = Object.keys(ITEM_HOME) as Item[];
  for (const id of MERCHANT_IDS) {
    prices[id] = {};
    buyPrices[id] = {};
    for (const item of items) {
      const sell = quotePrice(priceInput(w, id, "sell", item, 1)).price_per;
      if (sell > 0) prices[id][item] = sell;
      if (MERCHANTS[id].trades.includes(item)) {
        const buy = quotePrice(priceInput(w, id, "buy", item, 1)).price_per;
        if (buy > 0) buyPrices[id][item] = buy;
      }
    }
    const h = HEADLINE[id];
    reasoning[id] = quotePrice(priceInput(w, id, h.side, h.item, 1)).reasoning;
  }
  return {
    night,
    step,
    prices,
    buyPrices,
    reasoning,
    merchants: MERCHANT_IDS.map((id) => {
      const m = w.merchants[id];
      return { id, till: m.till, lanterns: m.lanterns, open: m.open, stock: { ...m.stock } };
    }),
    yarn: { supply: w.yarn.total_supply, treasury: w.yarn.treasury, streak: w.yarn.streak, lives: w.yarn.lives, longest: w.yarn.longest },
    events: w.events.map((e) => ({ kind: e.kind, text: e.text })),
    feed,
  };
}

// ---- The week ---------------------------------------------------------------------

function initialWorld(seed: number, beastCount: number): World {
  const rng = makeRng(seed);
  const zeroRep = (): Record<MerchantId, number> => ({ tom: 0, miso: 0, bandit: 0, clove: 0 });
  const beasts: BeastState[] = Array.from({ length: beastCount }, (_, i) => ({
    name: BEAST_NAMES[i % BEAST_NAMES.length] + (i >= BEAST_NAMES.length ? ` ${Math.floor(i / BEAST_NAMES.length) + 1}` : ""),
    lives: rng.int(5, 9),
    yarn: 20,
    inventory: {},
    hot: [],
    rep: zeroRep(),
    visits: zeroRep(),
  }));
  const merchants: Record<MerchantId, MerchantState> = {
    // Old Tom starts the week poor and on three lanterns: he is the one to watch.
    tom: { id: "tom", till: 45, lanterns: 3, open: true, stock: { fish: 20 }, soldTonight: {} },
    miso: { id: "miso", till: 220, lanterns: 9, open: true, stock: { button: 20 }, soldTonight: {} },
    bandit: { id: "bandit", till: 600, lanterns: 7, open: true, stock: { bell: 8, moonstone: 3 }, soldTonight: {} },
    clove: { id: "clove", till: 200, lanterns: 8, open: true, stock: { charm: 10, catnip: 12, lantern: 5 }, soldTonight: {} },
  };
  const treasury = 300;
  const townsfolk = 1500;
  const held = townsfolk + beasts.reduce((s, b) => s + b.yarn, 0) + MERCHANT_IDS.reduce((s, id) => s + merchants[id].till, 0);
  // The alley is mid-story: a streak of 2, the Longest Night stands at 4, five lives left.
  const yarn = initialYarnState({ night: 1, total_supply: held + treasury, treasury, streak: 2, run: 2, longest: 4, record: 4, lives: 5 });
  return {
    rng,
    merchants,
    beasts,
    yarn,
    yarnBaseline: yarn.total_supply,
    history: [],
    events: [],
    stallRent: BASE_STALL_RENT,
    stallsFilled: 11,
    closedOn: {},
    falls: 0,
    daringRuns: 0,
    thievesCaught: 0,
    thievesEscaped: 0,
    tuggers: new Set(),
    festivalTomorrow: false,
    storm: false,
    townsfolk,
    requests: [],
  };
}

export function* simulateWeek(opts: SimOptions = {}): Generator<SimSnapshot> {
  const seed = opts.seed ?? DEFAULT_SIM_SEED;
  const nights = opts.nights ?? 7;
  const steps = Math.max(1, opts.stepsPerNight ?? 12);
  const scenario = opts.scenario ?? "steady";
  const w = initialWorld(seed, Math.max(1, opts.beasts ?? 24));

  for (let night = 1; night <= nights; night++) {
    w.events = detectEvents(w.history);
    w.falls = 0;
    w.daringRuns = 0;
    w.thievesCaught = 0;
    w.thievesEscaped = 0;
    w.tuggers = new Set();
    w.festivalTomorrow = recordWithinReach(w.yarn);
    const share = participation(scenario, night);
    w.storm = share < 0.5;
    w.requests = nightlyRequests({
      night,
      merchants: Object.fromEntries(
        MERCHANT_IDS.map((id) => [id, { open: w.merchants[id].open, stock: w.merchants[id].stock, boughtTonight: {} }]),
      ) as Parameters<typeof nightlyRequests>[0]["merchants"],
      activeEvents: w.events.map((e) => e.kind),
      bindsTonight: 0,
      beasts: w.beasts.length,
    });

    // Who comes out tonight, and when.
    const schedule: number[][] = Array.from({ length: steps }, () => []);
    w.beasts.forEach((_, idx) => {
      if (w.rng.chance(share)) schedule[w.rng.int(0, steps - 1)].push(idx);
    });

    for (let step = 0; step < steps; step++) {
      const feed: string[] = [];
      if (step === 0) {
        feed.push(`Night ${night} falls on Lantern Lane.${w.storm ? " A storm rolls over the rooftops; most Beasts stay in." : ""}`);
        for (const e of w.events) feed.push(e.text);
        if (w.yarn.festival) feed.push("Lanterns everywhere: it's the Moon Festival!");
        if (w.festivalTomorrow) feed.push("One more good night breaks the Longest Night. Old Tom is stocking up on fish.");
        for (const r of w.requests) {
          if (r.kind === "want" && r.wanted > 0) feed.push(`Notice board, ${MERCHANTS[r.merchant].name}: "${r.text}"`);
          if (r.kind === "refuse") feed.push(`Notice board, ${MERCHANTS[r.merchant].name}: "${r.text}"`);
        }
      }

      // Investors relight a dark stall halfway through the night after it closed.
      if (step === Math.floor(steps / 2)) {
        for (const id of MERCHANT_IDS) {
          const closedOn = w.closedOn[id];
          if (closedOn !== undefined && closedOn < night && !w.merchants[id].open) {
            const backers = [...w.beasts].sort((a, b) => b.yarn - a.yarn).slice(0, 3);
            const share = Math.ceil(REVIVE_YARN / backers.length);
            for (const b of backers) b.yarn -= Math.min(b.yarn, share);
            const m = w.merchants[id];
            m.till += REVIVE_YARN;
            m.lanterns = REVIVE_LANTERNS;
            m.open = true;
            delete w.closedOn[id];
            feed.push(`${backers.map((b) => b.name).join(", ")} chip in ${REVIVE_YARN} YARN to relight ${MERCHANTS[id].name}'s stall (${REVIVE_LANTERNS} lanterns).`);
          }
        }
      }

      for (const idx of schedule[step]) prowl(w, idx, feed);
      yield snapshot(w, night, step, feed);
    }

    const closing: string[] = [];
    closeNight(w, night, closing);
    // Keep the books honest: total supply equals everything held.
    w.yarn = { ...w.yarn, total_supply: totalHeld(w) };
    yield snapshot(w, night, steps, closing);
  }
}

function totalHeld(w: World): number {
  return (
    w.townsfolk +
    w.beasts.reduce((s, b) => s + b.yarn, 0) +
    MERCHANT_IDS.reduce((s, id) => s + w.merchants[id].till, 0) +
    w.yarn.treasury
  );
}
