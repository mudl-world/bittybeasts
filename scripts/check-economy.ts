// Sanity checks for the Lantern Lane economy.
//   ./node_modules/.bin/tsx scripts/check-economy.ts      (or: pnpm tsx scripts/check-economy.ts)

import assert from "node:assert/strict";
import { detectEvents, type NightStats } from "../lib/economy/events";
import { MERCHANTS, nextStallRent, quotePrice, type PricingInput } from "../lib/economy/pricing";
import { nightlyRequests, openRequestFor, type RequestInput } from "../lib/economy/requests";
import { simulateWeek } from "../lib/economy/sim";
import { initialYarnState, settleNight, YARN_RULES } from "../lib/economy/yarn";

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const tomFish = (over: Partial<PricingInput> = {}): PricingInput => ({
  merchant: "tom",
  side: "sell",
  item: "fish",
  amount: 1,
  reputation: 0,
  merchantStock: { fish: 10 },
  capacity: MERCHANTS.tom.capacity,
  till: 500,
  lanterns: 9,
  openMerchants: ["tom", "miso", "bandit", "clove"],
  soldTonight: {},
  yarnSupply: 1000,
  yarnBaseline: 1000,
  festivalTomorrow: false,
  festivalTonight: false,
  fallsLastNight: 0,
  daringRunsLastNight: 0,
  activeEvents: [],
  ...over,
});
const price = (i: PricingInput) => quotePrice(i).price_per;

// ---- Pricing -------------------------------------------------------------------
check("a fuller ice box pays less", () => {
  assert.ok(price(tomFish({ merchantStock: { fish: 35 } })) < price(tomFish({ merchantStock: { fish: 2 } })));
});
check("fish glut: Tom pays almost nothing", () => {
  const glut = price(tomFish({ merchantStock: { fish: 37 }, activeEvents: ["fish_glut"] }));
  assert.ok(glut <= 1, `glut price ${glut}`);
  assert.ok(glut < price(tomFish({ merchantStock: { fish: 37 } })));
});
check("mischief raises the price you pay and lowers what you get", () => {
  const buy = (reputation: number) => price(tomFish({ side: "buy", reputation }));
  assert.ok(buy(-60) > buy(0));
  assert.ok(price(tomFish({ reputation: -60 })) < price(tomFish()));
});
check("protection makes Lucky Charms cheaper", () => {
  const charm = (reputation: number): PricingInput => ({ ...tomFish(), merchant: "clove", side: "buy", item: "charm", capacity: MERCHANTS.clove.capacity, merchantStock: { charm: 8 }, reputation });
  assert.ok(price(charm(60)) < price(charm(0)));
});
check("last lantern: merchant sells at a discount", () => {
  assert.ok(price(tomFish({ side: "buy", lanterns: 1 })) < price(tomFish({ side: "buy", lanterns: 9 })));
});
check("Moon Festival: merchants pay +50%", () => {
  const base = { merchant: "bandit" as const, item: "moonstone" as const, capacity: MERCHANTS.bandit.capacity, merchantStock: { moonstone: 2 } };
  const normal = price(tomFish(base));
  const festival = price(tomFish({ ...base, festivalTonight: true }));
  assert.ok(Math.abs(festival / normal - 1.5) < 0.06, `${normal} -> ${festival}`);
});
check("Tom pays double the night before the festival", () => {
  const normal = price(tomFish({ merchantStock: { fish: 0 } }));
  const eve = price(tomFish({ merchantStock: { fish: 0 }, festivalTomorrow: true }));
  assert.ok(eve >= 2 * normal - 1, `${normal} -> ${eve}`);
});
check("closed merchant refuses; others lowball its goods", () => {
  assert.equal(price(tomFish({ lanterns: 0, openMerchants: ["miso", "bandit", "clove"] })), 0);
  const miso = { merchant: "miso" as const, capacity: MERCHANTS.miso.capacity, merchantStock: { button: 10 } };
  assert.equal(price(tomFish(miso)), 0, "Miso won't buy fish while Tom is open");
  const lowball = price(tomFish({ ...miso, openMerchants: ["miso", "bandit", "clove"] }));
  assert.ok(lowball > 0 && lowball < price(tomFish({ merchantStock: { fish: 0 } })));
});
check("charms cost more after a night of falls", () => {
  const charm = (falls: number): PricingInput => ({ ...tomFish(), merchant: "clove", side: "buy", item: "charm", capacity: MERCHANTS.clove.capacity, merchantStock: { charm: 8 }, fallsLastNight: falls, daringRunsLastNight: 10 });
  assert.ok(price(charm(6)) > price(charm(0)));
});
check("more YARN in circulation makes goods pricier", () => {
  assert.ok(price(tomFish({ side: "buy", yarnSupply: 2000 })) > price(tomFish({ side: "buy" })));
});
check("a merchant never pays more than its till", () => {
  const q = quotePrice(tomFish({ till: 6, amount: 3 }));
  assert.ok(q.price_per * 3 <= 6);
  assert.equal(price(tomFish({ till: 0 })), 0);
});
check("reasoning is in the merchant's voice", () => {
  const q = quotePrice(tomFish({ merchantStock: { fish: 32 }, soldTonight: { fish: 3 }, reputation: -30 }));
  assert.match(q.reasoning, /take it or leave it/);
  assert.match(q.reasoning, /Ice box is 80% full/);
});
check("stall rent rises when full, falls when empty", () => {
  assert.ok(nextStallRent(5, 12) > 5);
  assert.ok(nextStallRent(5, 6) < 5);
  assert.equal(nextStallRent(5, 11), 5);
});

// ---- Events ---------------------------------------------------------------------
const night = (over: Partial<NightStats> = {}): NightStats => ({
  night: 1,
  tomFishStock: 10,
  tomFishCapacity: 40,
  thievesEscaped: 0,
  thievesCaught: 0,
  daringRuns: 10,
  falls: 1,
  merchantLanterns: { tom: 9, miso: 9, bandit: 9, clove: 9 },
  recordBroken: false,
  ...over,
});
const kinds = (h: NightStats[]) => detectEvents(h).map((e) => e.kind);
check("fish glut needs 3 nights over 90%", () => {
  const full = night({ tomFishStock: 38 });
  assert.ok(!kinds([full, full]).includes("fish_glut"));
  assert.ok(kinds([full, full, full]).includes("fish_glut"));
});
check("rat swarm after 2 nights of escapes", () => {
  const bad = night({ thievesEscaped: 5, thievesCaught: 2 });
  assert.ok(kinds([bad, bad]).includes("rat_swarm"));
  assert.ok(!kinds([night(), bad]).includes("rat_swarm"));
});
check("bad night, last lantern, moon festival", () => {
  assert.ok(kinds([night({ falls: 6 })]).includes("bad_night"));
  assert.ok(kinds([night({ merchantLanterns: { tom: 1, miso: 9, bandit: 9, clove: 9 } })]).includes("last_lantern"));
  assert.ok(kinds([night({ recordBroken: true })]).includes("moon_festival"));
});

// ---- $YARN ----------------------------------------------------------------------
check("hit mints 10 per tugger and grows the streak", () => {
  const { state, outcome } = settleNight(initialYarnState({ total_supply: 100 }), 6, 10);
  assert.ok(outcome.hit);
  assert.equal(outcome.minted, 6 * YARN_RULES.mint_per_tug);
  assert.equal(state.total_supply, 160);
  assert.equal(state.streak, 1);
});
check("miss burns 5% of treasury, costs a life, keeps the streak", () => {
  const { state, outcome } = settleNight(initialYarnState({ total_supply: 1000, treasury: 400, streak: 4, run: 4 }), 5, 10);
  assert.ok(!outcome.hit);
  assert.equal(outcome.burned, 20);
  assert.equal(state.total_supply, 980);
  assert.equal(state.lives, 8);
  assert.equal(state.streak, 4);
  assert.equal(state.run, 0);
});
check("out of lives: streak resets, lives refill", () => {
  const { state, outcome } = settleNight(initialYarnState({ lives: 1, streak: 12, longest: 12 }), 0, 10);
  assert.ok(outcome.reset);
  assert.equal(state.streak, 0);
  assert.equal(state.lives, 9);
  assert.equal(state.record, 12);
});
check("7 consecutive good nights win a life back", () => {
  let s = initialYarnState({ lives: 5 });
  for (let i = 0; i < 7; i++) s = settleNight(s, 10, 10).state;
  assert.equal(s.lives, 6);
});
check("breaking the Longest Night lights the festival", () => {
  const { state, outcome } = settleNight(initialYarnState({ streak: 4, longest: 4, record: 4 }), 10, 10);
  assert.ok(outcome.recordBroken && state.festival);
  const first = settleNight(initialYarnState({ streak: 1, longest: 1, record: 0 }), 10, 10);
  assert.ok(!first.outcome.recordBroken, "first streak has no record to beat");
});

// ---- Nightly requests ------------------------------------------------------------
const board = (over: Partial<RequestInput> = {}, stock: Partial<Record<string, number>> = {}) =>
  nightlyRequests({
    night: 3,
    merchants: {
      tom: { open: true, stock: { fish: stock.fish ?? 8 }, boughtTonight: {} },
      miso: { open: true, stock: { button: stock.button ?? 48 }, boughtTonight: {} },
      bandit: { open: true, stock: { bell: 10, moonstone: 5 }, boughtTonight: {} },
      clove: { open: true, stock: { charm: 8, catnip: 15, lantern: 6 }, boughtTonight: {} },
    },
    activeEvents: [],
    bindsTonight: 1,
    beasts: 6,
    ...over,
  });

check("an empty shelf posts a request that pays +25%", () => {
  const r = openRequestFor(board(), "tom", "fish");
  assert.ok(r && r.wanted >= 3 && r.remaining === r.wanted);
  assert.equal(price(tomFish({ merchantStock: { fish: 8 }, requestRemaining: r.remaining })), Math.round(price(tomFish({ merchantStock: { fish: 8 } })) * 1.25) );
  assert.match(quotePrice(tomFish({ requestRemaining: 3 })).reasoning, /asked for/);
});

check("a flooded shelf or a glut posts a refusal instead", () => {
  assert.equal(board().find((r) => r.merchant === "miso")?.kind, "refuse");
  assert.equal(board({ activeEvents: ["fish_glut"] }).find((r) => r.merchant === "tom")?.kind, "refuse");
  assert.equal(openRequestFor(board({ activeEvents: ["fish_glut"] }), "tom", "fish"), undefined);
});

check("dark stalls ask for investors; Clove asks the alley for binds or herbs", () => {
  const dark = board({ merchants: { ...{ tom: { open: false, stock: {}, boughtTonight: {} } }, miso: { open: true, stock: {}, boughtTonight: {} }, bandit: { open: true, stock: {}, boughtTonight: {} }, clove: { open: true, stock: {}, boughtTonight: {} } } });
  assert.equal(dark.find((r) => r.merchant === "tom")?.kind, "closed");
  const clove = board().find((r) => r.merchant === "clove");
  assert.ok(clove?.kind === "help" && clove.got === 1 && clove.wanted === 3);
  assert.equal(board({ activeEvents: ["bad_night"] }).find((r) => r.merchant === "clove")?.item, "catnip");
});

check("requests count down as goods come in, and change with the night", () => {
  const tonight = nightlyRequests({
    night: 3,
    merchants: {
      tom: { open: true, stock: { fish: 13 }, boughtTonight: { fish: 5 } },
      miso: { open: true, stock: {}, boughtTonight: {} },
      bandit: { open: true, stock: {}, boughtTonight: {} },
      clove: { open: true, stock: {}, boughtTonight: {} },
    },
    activeEvents: [],
    bindsTonight: 0,
    beasts: 4,
  }).find((r) => r.merchant === "tom")!;
  assert.equal(tonight.got, 5);
  assert.equal(tonight.remaining, tonight.wanted - 5);
  assert.notEqual(board({ night: 3 }).find((r) => r.merchant === "tom")?.text, board({ night: 4 }).find((r) => r.merchant === "tom")?.text);
});

// ---- Simulator ------------------------------------------------------------------
check("simulateWeek is deterministic and tells the story", () => {
  const a = [...simulateWeek()];
  const b = [...simulateWeek()];
  assert.deepEqual(a, b);
  const feed = a.flatMap((s) => s.feed).join("\n");
  assert.match(feed, /Missed night/);
  assert.match(feed, /YARN minted/);
  assert.match(feed, /last lantern gutters out/);
  assert.match(feed, /relight/);
  assert.match(feed, /Moon Festival tomorrow/);
  assert.match(feed, /Notice board/);
  assert.ok(a.some((s) => s.events.some((e) => e.kind === "last_lantern")));
});

console.log(`\n${passed} checks passed.`);
