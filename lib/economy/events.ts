// =============================================================================
//  Lantern Lane events — every automatic event, its trigger and its effect,
//  in one file.
//
//  Events are detected from the history of finished nights (oldest first).
//  An event detected after night N is active during night N+1.
//  pricing.ts reads the active events; the game server / simulator applies
//  the non-price effects (more thieves, double bind pay, extra moonstones).
// =============================================================================

import type { MerchantId } from "./pricing";

export type EventKind = "fish_glut" | "rat_swarm" | "bad_night" | "last_lantern" | "moon_festival";

/** Everything the event rules need to know about one finished night. */
export type NightStats = {
  night: number;
  /** Fish in Old Tom's ice box at close, and how many it holds. */
  tomFishStock: number;
  tomFishCapacity: number;
  /** Rat thieves that got away vs. ones Beasts bound. */
  thievesEscaped: number;
  thievesCaught: number;
  /** Daring runs finished tonight, and how many of them ended in a fall. */
  daringRuns: number;
  falls: number;
  /** Lanterns each merchant has left after close_night (0 = closed). */
  merchantLanterns: Record<MerchantId, number>;
  /** The streak passed the Longest Night when this night settled. */
  recordBroken: boolean;
};

export type ActiveEvent = {
  kind: EventKind;
  /** One line for the Lane's notice board. */
  text: string;
  /** Set when the event is about one merchant (last lantern). */
  merchant?: MerchantId;
};

// ---- Effect sizes (read by pricing.ts and the simulator) --------------------

export const EVENT_EFFECTS = {
  /** Fish glut: Tom pays only 15% of his usual fish price. */
  fishGlutMultiplier: 0.15,
  /** Rat swarm: twice as many thieves on the rooftops ... */
  ratSwarmThieves: 2,
  /** ... and every bound thief pays double. */
  ratSwarmBindPay: 2,
  /** Bad night: Lucky Charms cost 25% more on top of the fall-rate rule. */
  badNightCharmMultiplier: 1.25,
  /** Bad night: Clove's herb request pays 50% more for catnip. */
  badNightCatnipBonus: 1.5,
  /** Last lantern: the merchant sells at 30% off to raise YARN. */
  lastLanternSellDiscount: 0.7,
  /** Moon Festival: every merchant pays 50% more. */
  festivalPayBonus: 1.5,
  /** Moon Festival: daring runs drop this many extra moonstones. */
  festivalExtraMoonstones: 1,
} as const;

// ---- The rules ---------------------------------------------------------------

type EventRule = {
  title: string;
  trigger: string;
  effect: string;
  detect: (history: NightStats[]) => ActiveEvent[];
};

const NAME: Record<MerchantId, string> = { tom: "Old Tom", miso: "Miso", bandit: "Bandit", clove: "Sister Clove" };

const last = <T>(list: T[], n: number): T[] => list.slice(Math.max(0, list.length - n));

export const EVENT_RULES: Record<EventKind, EventRule> = {
  fish_glut: {
    title: "Fish glut",
    trigger: "Old Tom's ice box is over 90% full at close for 3 nights running.",
    effect: "Tom pays almost nothing for fish (15% of normal) until it clears.",
    detect: (history) => {
      const recent = last(history, 3);
      const glut =
        recent.length === 3 &&
        recent.every((n) => n.tomFishCapacity > 0 && n.tomFishStock / n.tomFishCapacity > 0.9);
      return glut ? [{ kind: "fish_glut", text: "Fish glut! Old Tom's ice box is overflowing — he'll barely pay for fish." }] : [];
    },
  },

  rat_swarm: {
    title: "Rat swarm",
    trigger: "More thieves escaped than were caught, two nights in a row.",
    effect: "Twice as many thieves tonight, and every bind pays double.",
    detect: (history) => {
      const recent = last(history, 2);
      const swarm = recent.length === 2 && recent.every((n) => n.thievesEscaped > n.thievesCaught);
      return swarm ? [{ kind: "rat_swarm", text: "Rat swarm! Thieves everywhere — binds pay double tonight." }] : [];
    },
  },

  bad_night: {
    title: "Bad night",
    trigger: "More than half of last night's daring runs ended in a fall.",
    effect: "Lucky Charms cost more this morning; Sister Clove posts an herb request (pays more for catnip).",
    detect: (history) => {
      const n = history[history.length - 1];
      const bad = n !== undefined && n.daringRuns > 0 && n.falls / n.daringRuns > 0.5;
      return bad
        ? [{ kind: "bad_night", text: `Bad night: ${n.falls} of ${n.daringRuns} daring runs fell. Sister Clove wants catnip; charms are dear.` }]
        : [];
    },
  },

  last_lantern: {
    title: "Last lantern",
    trigger: "A merchant is down to their last lantern.",
    effect: "That merchant sells at a discount to raise YARN before close.",
    detect: (history) => {
      const n = history[history.length - 1];
      if (n === undefined) return [];
      return (Object.keys(n.merchantLanterns) as MerchantId[])
        .filter((m) => n.merchantLanterns[m] === 1)
        .map((m) => ({ kind: "last_lantern" as const, merchant: m, text: `${NAME[m]} is on the last lantern — everything on that stall is cheap tonight.` }));
    },
  },

  moon_festival: {
    title: "Moon Festival",
    trigger: "The streak broke the Longest Night.",
    effect: "For one night every merchant pays +50%, and daring runs drop extra moonstones.",
    detect: (history) => {
      const n = history[history.length - 1];
      return n?.recordBroken ? [{ kind: "moon_festival", text: "The Longest Night is broken! Moon Festival tonight: every merchant pays +50%." }] : [];
    },
  },
};

/** All events active for the coming night, given every finished night so far. */
export function detectEvents(history: NightStats[]): ActiveEvent[] {
  return (Object.keys(EVENT_RULES) as EventKind[]).flatMap((kind) => EVENT_RULES[kind].detect(history));
}
