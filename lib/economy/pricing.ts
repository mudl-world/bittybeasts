// =============================================================================
//  LANTERN LANE PRICING — every merchant price rule, in one readable file.
//
//  Four merchant agents run stalls on Lantern Lane. Each has its own NEAR
//  account, a till of $YARN, an inventory and nine lanterns (lives).
//  When a Beast asks for a quote, the merchant runs the rules below, top to
//  bottom. Each rule multiplies the price and (if it matters) adds a line to
//  the merchant's spoken reasoning. The final price is a whole number of YARN
//  (YARN has 0 decimals) and is signed by the merchant's key.
//
//  Two sides of a trade:
//    "sell" — the Beast SELLS to the merchant (the merchant pays from its till)
//    "buy"  — the Beast BUYS from the merchant (the merchant takes YARN)
//
//  A price of 0 means "no deal": the merchant is closed, doesn't trade that
//  item, has none in stock, or can't afford it.
//
//  The rules, in order:
//    1.  Closed stalls don't trade.
//    2.  Each merchant trades only their own goods — unless the usual buyer of
//        that item is closed, then others take it at a lowball price.
//    3.  Base price, plus the merchant's markup when selling to you.
//    4.  Personality (Tom is stingy, Bandit pays best, Clove is fair).
//    5.  Stock: a full store pays less and sells cheaper; an empty one the reverse.
//    6.  Busy night: the more of an item Beasts sold tonight, the less it fetches.
//    7.  Closed neighbours: with a stall shut, the others charge a bit more.
//    8.  $YARN supply: more YARN about -> goods cost more; after a burn, less.
//    9.  Reputation: mischief costs you, protection earns you a better price.
//    10. Miso remembers regulars.
//    11. Sister Clove's charms get dearer after a night of falls.
//    12. Events: fish glut, bad night (see events.ts).
//    12b. Tonight's request: selling toward a merchant's open request pays +25%
//         (requests.ts works out what each merchant wants from its shelves).
//    13. Old Tom pays double for fish the night before the Moon Festival.
//    14. Moon Festival: every merchant pays +50%.
//    15. Last lantern: a nervous merchant sells cheap and pays less.
//    16. Round to whole YARN (at least 1), and never pay more than the till holds.
// =============================================================================

import type { Item } from "@/lib/chain/types";
import { EVENT_EFFECTS, type EventKind } from "./events";

export type MerchantId = "tom" | "miso" | "bandit" | "clove";

export type MerchantMeta = {
  id: MerchantId;
  name: string;
  personality: string;
  /** Items this merchant buys and sells. */
  trades: Item[];
  /** How many of each item the stall can hold (Tom's "ice box"). */
  capacity: Partial<Record<Item, number>>;
  /** What the merchant pays a Beast for one unit, before any rule. */
  basePrice: Partial<Record<Item, number>>;
  /** Multiplier on basePrice when the merchant sells to a Beast. */
  markup: number;
};

export const MERCHANTS: Record<MerchantId, MerchantMeta> = {
  tom: {
    id: "tom",
    name: "Old Tom",
    personality: "Stingy and grumpy fishmonger. Hates a full ice box. Pays double before the Moon Festival.",
    trades: ["fish"],
    capacity: { fish: 40 },
    basePrice: { fish: 5 },
    markup: 1.5,
  },
  miso: {
    id: "miso",
    name: "Miso",
    personality: "Warm yarn-and-button seller who knits the Lane's hats and scarves. Remembers names; regulars get a discount.",
    trades: ["button", "hat", "scarf", "bow", "glasses"],
    capacity: { button: 50, hat: 10, scarf: 12, bow: 15, glasses: 6 },
    basePrice: { button: 4, hat: 10, scarf: 8, bow: 5, glasses: 14 },
    markup: 1.4,
  },
  bandit: {
    id: "bandit",
    name: "Bandit",
    personality: "Shady dealer in bells and moonstones. Best prices on the Lane, no questions asked.",
    trades: ["bell", "moonstone"],
    capacity: { bell: 20, moonstone: 10 },
    basePrice: { bell: 9, moonstone: 24 },
    markup: 1.25,
  },
  clove: {
    id: "clove",
    name: "Sister Clove",
    personality: "Calm, fair healer. Sells Lucky Charms, catnip and lanterns.",
    trades: ["charm", "catnip", "lantern"],
    capacity: { charm: 15, catnip: 30, lantern: 10 },
    basePrice: { charm: 14, catnip: 6, lantern: 18 },
    markup: 1.3,
  },
};

export const MERCHANT_IDS: MerchantId[] = ["tom", "miso", "bandit", "clove"];

/** Who normally deals in each item. */
export const ITEM_HOME: Record<Item, MerchantId> = {
  fish: "tom",
  button: "miso",
  bell: "bandit",
  moonstone: "bandit",
  charm: "clove",
  catnip: "clove",
  lantern: "clove",
  hat: "miso",
  scarf: "miso",
  bow: "miso",
  glasses: "miso",
};

/** Selling goods whipped off another merchant's awning to Bandit costs this much
 *  reputation with that merchant (applied at settlement, not in the price). */
export const BANDIT_STOLEN_GOODS_REP_COST = 5;

export type PricingInput = {
  merchant: MerchantId;
  side: "sell" | "buy";
  item: Item;
  amount: number;
  beastName?: string;
  /** This Beast's standing with this merchant, -100 (menace) .. 100 (protector). */
  reputation: number;
  merchantStock: Partial<Record<Item, number>>;
  capacity: Partial<Record<Item, number>>;
  /** YARN in the merchant's till. */
  till: number;
  /** Lanterns the merchant has left (0 = closed). */
  lanterns: number;
  openMerchants: MerchantId[];
  /** Units of each item Beasts have sold to this merchant tonight. */
  soldTonight: Partial<Record<Item, number>>;
  /** Total $YARN supply now, and the reference supply prices were set against. */
  yarnSupply: number;
  yarnBaseline: number;
  festivalTomorrow: boolean;
  festivalTonight: boolean;
  fallsLastNight: number;
  daringRunsLastNight: number;
  activeEvents: EventKind[];
  /** How many times this Beast has traded with this merchant (Miso keeps count). */
  regularVisits?: number;
  /** Goods whipped off another merchant's awning. Only Bandit will touch them. */
  stolen?: boolean;
  /** Units still wanted by this merchant's open request for this item tonight (requests.ts). */
  requestRemaining?: number;
};

/** Selling toward an open request pays this much more (rule 12b, see requests.ts). */
export const REQUEST_BONUS = 1.25;

export type PriceQuote = {
  price_per: number;
  reasoning: string;
  factors: { label: string; effect: string }[];
};

// ---- How each merchant talks --------------------------------------------------

type Voice = {
  /** Last sentence of every quote. */
  close: (price: number, name?: string) => string;
  /** What they say when there's no deal. */
  refuse: (why: string) => string;
};

const VOICES: Record<MerchantId, Voice> = {
  tom: {
    close: (p) => `${p} YARN, take it or leave it.`,
    refuse: (why) => `${why} Go bother someone else.`,
  },
  miso: {
    close: (p, name) => (name ? `${p} YARN for you, ${name}, dear.` : `${p} YARN, dear.`),
    refuse: (why) => `Oh, I'm sorry, love. ${why}`,
  },
  bandit: {
    close: (p) => `${p} YARN. You never saw me.`,
    refuse: (why) => `${why} Keep walking.`,
  },
  clove: {
    close: (p) => `${p} YARN. That is fair.`,
    refuse: (why) => `${why} Come back another night, little one.`,
  },
};

// ---- The rules ---------------------------------------------------------------

/** One rule's contribution: a price multiplier and, optionally, a spoken line. */
type Step = { label: string; multiplier: number; say?: string };

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function effectText(multiplier: number): string {
  if (multiplier >= 1.95) return `x${Math.round(multiplier * 10) / 10}`;
  const change = Math.round((multiplier - 1) * 100);
  return change >= 0 ? `+${change}%` : `${change}%`;
}

function refuse(input: PricingInput, label: string, why: string): PriceQuote {
  return { price_per: 0, reasoning: VOICES[input.merchant].refuse(why), factors: [{ label, effect: "no deal" }] };
}

export function quotePrice(input: PricingInput): PriceQuote {
  const m = MERCHANTS[input.merchant];
  const selling = input.side === "sell"; // the Beast sells, the merchant pays
  const steps: Step[] = [];

  // 1. Closed stalls don't trade. -----------------------------------------
  const open = input.lanterns > 0 && input.openMerchants.includes(m.id);
  if (!open) return refuse(input, "Stall closed (no lanterns lit)", "Stall's dark tonight.");

  // 2. Own goods only — except orphans of a closed stall, and Bandit's fencing.
  let base: number;
  if (input.stolen) {
    if (m.id !== "bandit" || !selling) {
      return refuse(input, "Stolen goods", "I know where that came from.");
    }
    // Bandit fences hot goods at 60% of what the rightful merchant would pay.
    // (It costs the Beast reputation with that merchant: BANDIT_STOLEN_GOODS_REP_COST.)
    base = MERCHANTS[ITEM_HOME[input.item]].basePrice[input.item] ?? 1;
    steps.push({ label: "Hot goods, fenced at 60%", multiplier: 0.6, say: "Fell off an awning, did it?" });
  } else if (m.trades.includes(input.item)) {
    base = m.basePrice[input.item] ?? 0;
  } else {
    const home = ITEM_HOME[input.item];
    const homeClosed = !input.openMerchants.includes(home);
    if (!selling || !homeClosed) {
      return refuse(input, `${m.name} doesn't trade ${input.item}`, `I don't deal in ${input.item}.`);
    }
    // The usual buyer is shut: we'll take it off your paws, but cheaply.
    base = MERCHANTS[home].basePrice[input.item] ?? 1;
    steps.push({
      label: `${MERCHANTS[home].name} is closed; buying ${input.item} as a favour`,
      multiplier: 0.5,
      say: `${MERCHANTS[home].name}'s shut, so I'll take your ${input.item}, but I've no use for it.`,
    });
  }

  // When the Beast is buying, the merchant must have the goods;
  // when the Beast is selling, the merchant must have room for them.
  const stock = input.merchantStock[input.item] ?? 0;
  const room = (input.capacity[input.item] ?? m.capacity[input.item] ?? Infinity) - stock;
  if (!selling && stock < input.amount) {
    return refuse(input, `Only ${stock} ${input.item} in stock`, `I've only got ${stock} ${input.item}.`);
  }
  if (selling && !input.stolen && room < input.amount) {
    return refuse(input, `No room for ${input.amount} more ${input.item}`, m.id === "tom" ? "Ice box is full." : `No room for more ${input.item}.`);
  }

  // 3. Markup when the merchant is the one selling. ------------------------
  if (!selling) steps.push({ label: "Merchant's markup", multiplier: m.markup });

  // 4. Personality. --------------------------------------------------------
  if (m.id === "tom" && selling) {
    steps.push({ label: "Tom is stingy", multiplier: 0.85 });
  }
  if (m.id === "bandit") {
    steps.push({
      label: "Bandit pays best, no questions asked",
      multiplier: selling ? 1.2 : 0.9,
      say: selling ? "No questions asked." : undefined,
    });
  }

  // 5. Stock vs. capacity. A full store pays less (and sells cheaper). ------
  const cap = input.capacity[input.item] ?? m.capacity[input.item] ?? 0;
  if (cap > 0 && !input.stolen) {
    const fill = clamp(stock / cap, 0, 1);
    const multiplier = selling ? 1.3 - 0.8 * fill : 1.25 - 0.5 * fill;
    const store = m.id === "tom" ? "Ice box is" : "My shelves are";
    steps.push({
      label: `${m.id === "tom" ? "Ice box" : "Stock"} ${pct(fill)} full (${stock}/${cap})`,
      multiplier,
      say: fill >= 0.6 ? `${store} ${pct(fill)} full.` : fill <= 0.2 ? `${store} nearly empty.` : undefined,
    });
  }

  // 6. Busy night: every unit sold tonight knocks 3% off, down to -30%. ------
  const soldTonight = input.soldTonight[input.item] ?? 0;
  if (selling && soldTonight > 0) {
    steps.push({
      label: `${soldTonight} ${input.item} sold here tonight`,
      multiplier: Math.max(0.7, 1 - 0.03 * soldTonight),
      say: soldTonight >= 3 ? `${soldTonight} ${input.item} already came in tonight.` : undefined,
    });
  }

  // 7. Closed neighbours: their customers come here, so goods cost more. ----
  const closed = MERCHANT_IDS.filter((id) => !input.openMerchants.includes(id));
  if (!selling && closed.length > 0) {
    steps.push({
      label: `${closed.length} stall(s) closed on the Lane`,
      multiplier: 1 + 0.1 * closed.length,
      say: `With ${closed.map((id) => MERCHANTS[id].name).join(" and ")} shut, everyone's queuing here.`,
    });
  }

  // 8. $YARN supply. Prices follow the square root of supply vs. baseline:
  //    twice the YARN about -> goods ~41% pricier; a burn makes YARN worth more.
  if (input.yarnBaseline > 0 && input.yarnSupply > 0) {
    const multiplier = clamp(Math.sqrt(input.yarnSupply / input.yarnBaseline), 0.6, 1.8);
    if (Math.abs(multiplier - 1) >= 0.01) {
      steps.push({
        label: `YARN supply ${pct(input.yarnSupply / input.yarnBaseline)} of baseline`,
        multiplier,
        say:
          multiplier >= 1.05
            ? "Lot of YARN floating about; goods cost more."
            : multiplier <= 0.95
              ? "YARN's scarce since the burn; it buys more."
              : undefined,
      });
    }
  }

  // 9. Reputation. -100..100 moves the price up to 25% either way.
  //    Mischief (whipping goods off this awning) makes you pay more and get less.
  //    Protection (binding rat thieves, returning goods) does the opposite,
  //    and protectors get Lucky Charms cheaper still.
  const rep = clamp(input.reputation, -100, 100);
  if (rep !== 0) {
    const multiplier = selling ? 1 + rep / 400 : 1 - rep / 400;
    steps.push({
      label: rep < 0 ? `Mischief here (reputation ${rep})` : `Protector here (reputation +${rep})`,
      multiplier,
      say: rep <= -10 ? "You knocked my sign down, don't think I forgot." : rep >= 10 ? "You chased the rats off my awning." : undefined,
    });
    if (!selling && input.item === "charm" && rep > 0) {
      steps.push({ label: "Protector's luck: cheaper Lucky Charm", multiplier: 1 - rep / 400 });
    }
  }

  // 10. Miso remembers regulars (3+ visits): 10% better either way. ---------
  if (m.id === "miso" && (input.regularVisits ?? 0) >= 3) {
    steps.push({
      label: `Regular customer (${input.regularVisits} visits)`,
      multiplier: selling ? 1.1 : 0.9,
      say: input.beastName ? `Always lovely to see you, ${input.beastName}.` : "You're one of my regulars.",
    });
  }

  // 11. Charms cost more the morning after a night of falls. ---------------
  //     Fall rate above 20% adds that rate to the price (40% fell -> +40%).
  if (!selling && input.item === "charm" && input.daringRunsLastNight > 0) {
    const fallRate = input.fallsLastNight / input.daringRunsLastNight;
    if (fallRate > 0.2) {
      steps.push({
        label: `${input.fallsLastNight} of ${input.daringRunsLastNight} daring runs fell last night`,
        multiplier: 1 + fallRate,
        say: `${input.fallsLastNight} Beasts fell last night; charms are much asked for.`,
      });
    }
  }

  // 12. Events (triggers live in events.ts). --------------------------------
  const has = (kind: EventKind) => input.activeEvents.includes(kind);
  if (has("fish_glut") && m.id === "tom" && input.item === "fish" && selling) {
    steps.push({ label: "Fish glut", multiplier: EVENT_EFFECTS.fishGlutMultiplier, say: "Fish glut. I'm drowning in the stuff." });
  }
  if (has("bad_night") && m.id === "clove") {
    if (!selling && input.item === "charm") {
      steps.push({ label: "Bad night: charms in short supply", multiplier: EVENT_EFFECTS.badNightCharmMultiplier });
    }
    if (selling && input.item === "catnip") {
      steps.push({
        label: "Herb request after a bad night",
        multiplier: EVENT_EFFECTS.badNightCatnipBonus,
        say: "I need catnip for the fallen. I'll pay well for it.",
      });
    }
  }

  // 12b. Tonight's request: the merchant asked for this, so it pays a bonus. --
  if (selling && !input.stolen && (input.requestRemaining ?? 0) > 0) {
    const lines: Record<MerchantId, string> = {
      tom: "You brought what I asked for. Fine. Extra.",
      miso: "Oh, just what I asked for! A little extra for you.",
      bandit: "That's what my buyer wanted. You'll get a premium.",
      clove: "Exactly what the hurt ones need. Thank you.",
    };
    steps.push({
      label: `Tonight's request: ${input.requestRemaining} more ${input.item} wanted`,
      multiplier: REQUEST_BONUS,
      say: lines[m.id],
    });
  }

  // 13. Old Tom pays double the night before the Moon Festival. ------------
  if (input.festivalTomorrow && m.id === "tom" && input.item === "fish" && selling) {
    steps.push({ label: "Moon Festival tomorrow", multiplier: 2, say: "Festival's tomorrow. Everyone wants fish." });
  }

  // 14. Moon Festival: every merchant pays +50%. ---------------------------
  if (input.festivalTonight && selling) {
    steps.push({ label: "Moon Festival tonight", multiplier: EVENT_EFFECTS.festivalPayBonus, say: "It's the Moon Festival!" });
  }

  // 15. Last lantern: sell cheap to raise YARN, and hold on to the till. -----
  if (input.lanterns === 1) {
    steps.push({
      label: "Last lantern lit",
      multiplier: selling ? 0.85 : EVENT_EFFECTS.lastLanternSellDiscount,
      say: selling ? "One lantern left. I can't be generous." : "One lantern left. I need YARN, so it's cheap tonight.",
    });
  }

  // 16. Round to whole YARN (at least 1); never pay more than the till holds.
  const raw = steps.reduce((price, s) => price * s.multiplier, base);
  let price = Math.max(1, Math.round(raw));
  if (selling) {
    const affordable = Math.floor(input.till / Math.max(1, input.amount));
    if (affordable < 1) return refuse(input, "Till is empty", "My till's empty.");
    if (affordable < price) {
      steps.push({ label: `Till only holds ${input.till} YARN`, multiplier: affordable / price, say: "That's all the till holds." });
      price = affordable;
    }
  }

  // The merchant speaks: up to three of the weightiest reasons, then the price.
  const spoken = steps
    .filter((s) => s.say !== undefined)
    .sort((a, b) => Math.abs(Math.log(b.multiplier || 1)) - Math.abs(Math.log(a.multiplier || 1)))
    .slice(0, 3)
    .map((s) => s.say as string);
  const reasoning = [...spoken, VOICES[m.id].close(price, input.beastName)].join(" ");

  return {
    price_per: price,
    reasoning,
    factors: [
      { label: `Base price for ${input.item}`, effect: `${Math.round(base * 100) / 100} YARN` },
      ...steps.map((s) => ({ label: s.label, effect: effectText(s.multiplier) })),
    ],
  };
}

// =============================================================================
//  House rules of the Lane: stall rent and the market fee.
// =============================================================================

export const STALL_SLOTS = 12;
export const BASE_STALL_RENT = 5;
/** 2% of every market trade goes to the $YARN treasury. */
export const MARKET_FEE_BPS = 200;

/** YARN that goes to the treasury on a trade of `total` YARN. */
export function marketFee(total: number): number {
  return Math.floor((total * MARKET_FEE_BPS) / 10_000);
}

/**
 * Tomorrow's stall rent. When all 12 slots are taken, rent rises 10% (at least 1).
 * When a quarter or more of the slots sit empty, it falls 10% (never below 1).
 */
export function nextStallRent(rent: number, filledSlots: number): number {
  if (filledSlots >= STALL_SLOTS) return Math.max(rent + 1, Math.round(rent * 1.1));
  if (STALL_SLOTS - filledSlots >= STALL_SLOTS / 4) return Math.max(1, Math.min(rent - 1, Math.round(rent * 0.9)));
  return rent;
}
