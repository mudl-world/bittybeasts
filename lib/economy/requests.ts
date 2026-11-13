// =============================================================================
//  NIGHTLY REQUESTS — what each merchant wants tonight, worked out from the
//  live market. Nothing here is scripted: the same rules read stock, demand,
//  events and lanterns, so the notice board changes every night on its own.
//
//  The rules:
//    1. A dark stall posts no request. Its board says it needs investors.
//    2. Tom, Miso and Bandit look at the item they're shortest of (stock vs. room).
//       - Shelves at or under 60% full: they post a WANT for enough to reach 60%
//         (3 to 15 units). Anything sold to them toward it pays REQUEST_BONUS more
//         (pricing.ts rule 12b) until the request is filled.
//       - Every shelf over 85% full, or a fish glut for Tom: they post a REFUSAL
//         ("don't bring me fish") so players know to haul something else.
//    3. Sister Clove never asks for goods. She asks the alley for help:
//       - after a bad night, catnip for the fallen (paid by the bad-night event in pricing.ts);
//       - otherwise, Gnawers bound tonight, counted by the alley contract.
//    4. Requests are worked out fresh for each night, so a request that's filled
//       tonight is gone tomorrow, and a merchant who was flooded posts a refusal.
// =============================================================================

import type { Item } from "@/lib/chain/types";
import type { EventKind } from "./events";
import { MERCHANT_IDS, MERCHANTS, type MerchantId } from "./pricing";

export { REQUEST_BONUS } from "./pricing";
/** Shelves at or below this share of capacity make a merchant ask for more. */
export const WANT_BELOW = 0.6;
/** Shelves above this share of capacity make a merchant refuse more. */
export const REFUSE_ABOVE = 0.85;

/** What Beasts actually bring back from prowls (requests only ever ask for these). */
const ROOFTOP_LOOT: Item[] = ["fish", "button", "bell", "moonstone"];

export type RequestKind = "want" | "refuse" | "closed" | "help";

export type MerchantRequest = {
  merchant: MerchantId;
  kind: RequestKind;
  item?: Item;
  /** Units (or binds, for Clove) wanted tonight. */
  wanted: number;
  /** How many have come in so far tonight. */
  got: number;
  /** wanted - got, never below 0. */
  remaining: number;
  /** The merchant's own words for the notice board. */
  text: string;
};

export type RequestInput = {
  night: number;
  merchants: Record<MerchantId, { open: boolean; stock: Partial<Record<Item, number>>; boughtTonight: Partial<Record<Item, number>> }>;
  activeEvents: EventKind[];
  /** Rat thieves bound by every Beast tonight (alley night_stats.binds). */
  bindsTonight: number;
  /** Beasts registered, to size Clove's ask. */
  beasts: number;
};

// A few ways each merchant says the same thing, picked by night so the board reads fresh.
const pick = <T,>(lines: T[], night: number, salt: number) => lines[(night * 7 + salt) % lines.length];

const WANT_LINES: Record<Exclude<MerchantId, "clove">, ((n: number, item: string) => string)[]> = {
  tom: [
    (n, i) => `Ice box is near empty. Bring me ${n} ${i} before dawn and I'll pay over the odds. Don't get used to it.`,
    (n, i) => `${n} ${i}. Tonight. Fresh off the sills, none of that half-chewed rubbish.`,
    (n, i) => `The fishwives are asking and I've nothing to give 'em. ${n} ${i}, and I'll be fair for once.`,
  ],
  miso: [
    (n, i) => `My jars are looking sad, loves. ${n} shiny ${i}s and I'll pay you extra, promise.`,
    (n, i) => `Knitting a lantern-cosy for the Great Yarn and I'm ${n} ${i}s short. Help an old cat out?`,
    (n, i) => `Anyone seen ${i}s on the rooftops? I need ${n}. Extra for whoever brings them, dear.`,
  ],
  bandit: [
    (n, i) => `Buyer across the river wants ${i}s. ${n} of them. Pays well. Don't ask who.`,
    (n, i) => `Looking for ${n} ${i}s. Quietly. Premium for quiet.`,
    (n, i) => `Shelf's bare where the ${i}s go. ${n} more and you'll find me generous.`,
  ],
};

const REFUSE_LINES: Record<Exclude<MerchantId, "clove">, ((i: string) => string)[]> = {
  tom: [(i) => `Don't bring me ${i}. The ice box is full and it stinks.`, (i) => `One more ${i} and I'm throwing it back at you.`],
  miso: [(i) => `I'm buried in ${i}s tonight, dear. Try Bandit's bells?`, (i) => `No more ${i}s, love, I can't close the jars.`],
  bandit: [(i) => `Too many ${i}s floating about. I'm not buying.`, (i) => `${i}s? Market's flooded. Bring me something rare.`],
};

const CLOSED_LINES = [
  "Lights out. This stall needs YARN from investors before it opens again.",
  "Dark stall. A few YARN from the alley would relight a lantern.",
];

const CLOVE_BIND = [
  (n: number) => `The Gnawers are at the yarn again. Bind ${n} of them tonight, all of you together, and keep the lanterns safe.`,
  (n: number) => `I heard chewing on the rooftops. ${n} Gnawers bound before dawn, little ones, and the Lane sleeps easy.`,
  (n: number) => `Every rat you bind is a thread saved. ${n} tonight, between all of you.`,
];
const CLOVE_HERBS = (n: number) => `So many fell last night. Bring me catnip for the hurt ones, ${n} sprigs, and I'll pay you well for each.`;

export function nightlyRequests(input: RequestInput): MerchantRequest[] {
  return MERCHANT_IDS.map((id, salt) => {
    const m = input.merchants[id];
    if (!m.open) {
      return { merchant: id, kind: "closed" as const, wanted: 0, got: 0, remaining: 0, text: pick(CLOSED_LINES, input.night, salt) };
    }
    if (id === "clove") {
      if (input.activeEvents.includes("bad_night")) {
        const got = m.boughtTonight.catnip ?? 0;
        const wanted = 5;
        return { merchant: id, kind: "want" as const, item: "catnip" as Item, wanted, got, remaining: Math.max(0, wanted - got), text: CLOVE_HERBS(wanted) };
      }
      const wanted = Math.max(2, Math.ceil(input.beasts / 2));
      return {
        merchant: id,
        kind: "help" as const,
        wanted,
        got: input.bindsTonight,
        remaining: Math.max(0, wanted - input.bindsTonight),
        text: pick(CLOVE_BIND, input.night, salt)(wanted),
      };
    }

    const meta = MERCHANTS[id];
    // Only things a Beast can find on the rooftops; Miso knits the wardrobe herself.
    const shelves = meta.trades.filter((item) => ROOFTOP_LOOT.includes(item)).map((item) => {
      const cap = meta.capacity[item] ?? 1;
      const stock = m.stock[item] ?? 0;
      return { item, cap, stock, fill: stock / cap };
    });
    const glut = id === "tom" && input.activeEvents.includes("fish_glut");
    const fullest = [...shelves].sort((a, b) => b.fill - a.fill)[0];
    if (glut || shelves.every((s) => s.fill > REFUSE_ABOVE)) {
      return { merchant: id, kind: "refuse" as const, item: fullest.item, wanted: 0, got: 0, remaining: 0, text: pick(REFUSE_LINES[id], input.night, salt)(fullest.item) };
    }
    const emptiest = [...shelves].sort((a, b) => a.fill - b.fill)[0];
    if (emptiest.fill <= WANT_BELOW) {
      // Sized at dusk: the amount that would have filled the shelf to 60% before tonight's sales.
      const got = m.boughtTonight[emptiest.item] ?? 0;
      const atDusk = Math.max(0, emptiest.stock - got);
      const wanted = Math.min(15, Math.max(3, Math.ceil(emptiest.cap * WANT_BELOW) - atDusk));
      return {
        merchant: id,
        kind: "want" as const,
        item: emptiest.item,
        wanted,
        got,
        remaining: Math.max(0, wanted - got),
        text: pick(WANT_LINES[id], input.night, salt)(wanted, emptiest.item),
      };
    }
    return {
      merchant: id,
      kind: "want" as const,
      wanted: 0,
      got: 0,
      remaining: 0,
      text: id === "tom" ? "Shelves are fine. Sell me fish if you must." : id === "miso" ? "All stocked up tonight, dear. Come say hello anyway." : "Nothing special tonight. Usual prices.",
    };
  });
}

/** The open request that a sale of `item` to `merchant` counts toward, if any. */
export function openRequestFor(requests: MerchantRequest[], merchant: MerchantId, item: Item): MerchantRequest | undefined {
  return requests.find((r) => r.merchant === merchant && r.kind === "want" && r.item === item && r.remaining > 0 && merchant !== "clove");
}
