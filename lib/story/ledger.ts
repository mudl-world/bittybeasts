// =============================================================================
//  THE LANTERN LEDGER — the Lane's nightly paper, written from what really
//  happened. Pure functions: give it the chain's own records and it writes the
//  history. No stories are invented; every line comes from a contract record.
//
//    $YARN log       -> good nights, missed nights, lives lost and won, records, the Long Dark
//    alley night_stats -> falls, daring runs, Gnawers bound, goods sold
//    Beast diaries   -> who woke, who fell, who sold what, who wandered off, who was adopted
//    merchants       -> who's on their last lanterns, who went dark
// =============================================================================

import type { HistoryEntry, MerchantView, YarnLogEntry, YarnState } from "@/lib/chain/types";
import type { MerchantRequest } from "@/lib/economy/requests";
import { MERCHANTS } from "@/lib/economy/pricing";
import { ageName, ageOrdinal } from "./world";

export type NightStatsView = {
  daring_runs: number;
  falls: number;
  safe_runs: number;
  binds: number;
  whips_on_awnings: number;
  sold: Record<string, string>;
  tugs: number;
};

export type Story = { tone: "good" | "bad" | "plain" | "legend"; text: string };
export type Edition = { night: number; age: number; headline: Story; stories: Story[] };

export type Age = {
  age: number;
  name: string;
  ordinal: string;
  fromNight: number;
  /** null while the Age is still going. */
  toNight: number | null;
  goodNights: number;
  missedNights: number;
  longestStreak: number;
  minted: number;
  burned: number;
  festivals: number;
};

const n = (s: string | undefined) => Number(s ?? 0);

/** Split the $YARN log into Ages. Each "reset" (all nine alley lives gone) ends one. */
export function agesFrom(log: YarnLogEntry[], currentNight: number): Age[] {
  const sorted = [...log].sort((a, b) => a.night - b.night);
  const ages: Age[] = [];
  let cur: Age = blankAge(1, sorted[0]?.night ?? currentNight);
  let streak = 0;
  for (const e of sorted) {
    if (e.kind === "mint") {
      cur.goodNights += 1;
      cur.minted += n(e.amount);
      streak += 1;
      cur.longestStreak = Math.max(cur.longestStreak, streak);
    } else if (e.kind === "burn") {
      cur.burned += n(e.amount);
    } else if (e.kind === "life_lost") {
      cur.missedNights += 1;
      streak = 0;
    } else if (e.kind === "record") {
      cur.festivals += 1;
    } else if (e.kind === "reset") {
      cur.toNight = e.night;
      ages.push(cur);
      cur = blankAge(cur.age + 1, e.night + 1);
      streak = 0;
    }
  }
  ages.push(cur);
  return ages;
}

function blankAge(age: number, fromNight: number): Age {
  return {
    age,
    name: ageName(age),
    ordinal: ageOrdinal(age),
    fromNight,
    toNight: null,
    goodNights: 0,
    missedNights: 0,
    longestStreak: 0,
    minted: 0,
    burned: 0,
    festivals: 0,
  };
}

export function ageAt(ages: Age[], night: number): number {
  return ages.find((a) => night >= a.fromNight && (a.toNight === null || night <= a.toNight))?.age ?? ages[ages.length - 1]?.age ?? 1;
}

/** Which night a timestamp fell in, given the start of the current night. */
export function nightOf(atMs: number, current: { night: number; started_ms: number; night_ms: number }): number {
  if (atMs >= current.started_ms) return current.night;
  return Math.max(0, current.night - Math.ceil((current.started_ms - atMs) / current.night_ms));
}

export type BeastDiary = { name: string; entries: HistoryEntry[] };

/** One edition per finished night that has anything to report, newest first. */
export function writeLedger(input: {
  log: YarnLogEntry[];
  stats: Record<number, NightStatsView>;
  diaries: BeastDiary[];
  current: { night: number; started_ms: number; night_ms: number };
  ages: Age[];
  /** How many past nights to write up. */
  nights?: number;
}): Edition[] {
  const span = input.nights ?? 12;
  const first = Math.max(0, input.current.night - span);
  const out: Edition[] = [];

  for (let night = input.current.night - 1; night >= first; night--) {
    const age = ageAt(input.ages, night);
    const yarn = input.log.filter((e) => e.night === night);
    const stats = input.stats[night];
    const stories: Story[] = [];
    let headline: Story | null = null;
    const lead = (s: Story) => {
      if (!headline) headline = s;
      else stories.push(s);
    };

    // 1. The alley's own fate comes first.
    const reset = yarn.find((e) => e.kind === "reset");
    const record = yarn.find((e) => e.kind === "record");
    const mint = yarn.find((e) => e.kind === "mint");
    const burn = yarn.find((e) => e.kind === "burn");
    const lost = yarn.find((e) => e.kind === "life_lost");
    const back = yarn.find((e) => e.kind === "life_back");
    if (reset) {
      lead({
        tone: "legend",
        text: `THE LONG DARK. The alley's last lantern went out. ${ageName(age)} is over; the Lane is relit from nothing and ${ageName(age + 1).replace(/^The /, "the ")} begins.`,
      });
    }
    if (record) lead({ tone: "legend", text: "The Longest Night is broken! Lanterns everywhere: the Moon Festival is on." });
    if (lost) {
      lead({
        tone: "bad",
        text: `Quiet night. Too few cats came out to play. The alley lost a life${burn ? ` and ${n(burn.amount).toLocaleString()} YARN was destroyed` : ""}.`,
      });
    }
    if (mint) {
      lead({
        tone: "good",
        text: `Good night on the Lane. ${mint.accounts} cat${mint.accounts === 1 ? "" : "s"} came out to play, and ${n(mint.amount).toLocaleString()} new YARN was shared between them.`,
      });
    }
    if (back) lead({ tone: "good", text: "Seven good nights in a row: the alley won a life back." });

    // 2. The rooftops.
    if (stats) {
      if (stats.daring_runs > 0) {
        const share = stats.falls / stats.daring_runs;
        lead({
          tone: share > 0.5 ? "bad" : "plain",
          text:
            stats.falls === 0
              ? `${stats.daring_runs} daring run${stats.daring_runs === 1 ? "" : "s"} and not a single fall.`
              : `${stats.falls} of ${stats.daring_runs} daring runs ended in a fall.${share > 0.5 ? " Sister Clove was up all night." : ""}`,
        });
      }
      if (stats.binds > 0) lead({ tone: "good", text: `${stats.binds} Gnawer${stats.binds === 1 ? "" : "s"} bound in chains and handed over.` });
      if (stats.whips_on_awnings > 0)
        lead({ tone: "bad", text: `Somebody whipped goods off the merchants' own awnings ${stats.whips_on_awnings} time${stats.whips_on_awnings === 1 ? "" : "s"}. The merchants are keeping a list.` });
      const sold = Object.entries(stats.sold).filter(([, v]) => n(v) > 0);
      if (sold.length) lead({ tone: "plain", text: `Hauled to the merchants: ${sold.map(([k, v]) => `${v} ${k}`).join(", ")}.` });
    }

    // 3. The cats themselves.
    const window = (e: HistoryEntry) => nightOf(e.at_ms, input.current) === night;
    const personal: Story[] = [];
    for (const d of input.diaries) {
      for (const e of d.entries.filter(window)) {
        const s = personalStory(d.name, e);
        if (s) personal.push(s);
      }
    }
    personal.sort((a, b) => rank(b) - rank(a));
    for (const s of personal.slice(0, 6)) lead(s);

    if (headline) out.push({ night, age, headline, stories });
  }
  return out;
}

const rank = (s: Story) => (s.tone === "legend" ? 3 : s.tone === "bad" ? 2 : s.tone === "good" ? 1 : 0);

function personalStory(name: string, e: HistoryEntry): Story | null {
  switch (e.kind) {
    case "woke":
      return { tone: "good", text: `${name} opened its eyes for the first time. Nine links lit.` };
    case "prowl":
      if (/fell/i.test(e.text)) return { tone: "bad", text: `${name}: ${e.text}` };
      if (/charm/i.test(e.text)) return { tone: "plain", text: `${name}: ${e.text}` };
      return null;
    case "boop":
      return null;
    case "sell":
    case "buy":
      return n(e.yarn ?? undefined) >= 20 ? { tone: "plain", text: `${name}: ${e.text}` } : null;
    case "wander":
      return { tone: "plain", text: `${name} has gone wandering, looking for a new home.` };
    case "adopt":
      return { tone: "good", text: `${name} found a new home. ${e.text.replace(/^Adopted by [^ ]+ /, "Adopted ")}` };
    case "stall":
      return /Opened/i.test(e.text) ? { tone: "good", text: `${name} opened a stall on the Lane.` } : null;
    case "legend":
      return { tone: "legend", text: `${name} is a Legend. Golden links.` };
    case "revive":
      return { tone: "good", text: `${name}: ${e.text}` };
    default:
      return null;
  }
}

/** Tonight's front page: what the Lane needs right now. */
export function tonightStories(input: {
  yarn: YarnState;
  merchants: MerchantView[];
  requests: MerchantRequest[];
  events: { kind: string; text: string }[];
}): Story[] {
  const out: Story[] = [];
  const { yarn } = input;
  for (const e of input.events) out.push({ tone: e.kind === "moon_festival" ? "legend" : "bad", text: e.text });
  if (yarn.festival) out.push({ tone: "legend", text: "Moon Festival tonight: every merchant pays half again." });
  const need = Math.max(0, yarn.target_tonight - yarn.tugs_tonight);
  out.push(
    need === 0
      ? { tone: "good", text: `The Great Yarn has its ${yarn.target_tonight} tugs for tonight. Fresh YARN will be spun at dawn.` }
      : { tone: yarn.lives <= 3 ? "bad" : "plain", text: `The Great Yarn needs ${need} more tug${need === 1 ? "" : "s"} tonight (${yarn.tugs_tonight}/${yarn.target_tonight}). One prowl or one boop is a tug.` },
  );
  if (yarn.lives <= 3)
    out.push({ tone: "bad", text: `The alley is down to ${yarn.lives} li${yarn.lives === 1 ? "fe" : "ves"}. ${yarn.lives === 1 ? "One more missed night and the Long Dark falls." : "The Long Dark is getting close."}` });
  if (yarn.longest > 0 && yarn.streak === yarn.longest)
    out.push({ tone: "legend", text: `${yarn.streak} good nights in a row ties the Longest Night. One more and the Moon Festival begins.` });
  for (const m of input.merchants) {
    const name = m.name || m.account_id;
    if (!m.open) out.push({ tone: "bad", text: `${name}'s stall is dark. It needs investors to relight.` });
    else if (m.lanterns <= 3) out.push({ tone: "bad", text: `${name} is down to ${m.lanterns} lantern${m.lanterns === 1 ? "" : "s"}.${m.lanterns === 1 ? " Prices are nervous." : ""}` });
  }
  return out;
}

export const merchantName = (id: keyof typeof MERCHANTS) => MERCHANTS[id].name;
