// The live market, read straight from the chain. Safe on server and client:
// the merchant agents price from it, and the Lane, the Ledger and Clove read the same thing.
import { CONFIG } from "@/lib/chain/config";
import type { Item, MerchantView, NightView, YarnLogEntry, YarnState } from "@/lib/chain/types";
import { view } from "@/lib/chain/view";
import { detectEvents, type NightStats as EconNight } from "./events";
import { MERCHANT_IDS, MERCHANTS, type MerchantId } from "./pricing";
import { nightlyRequests, type MerchantRequest } from "./requests";

export type ChainNightStats = {
  daring_runs: number;
  falls: number;
  safe_runs: number;
  binds: number;
  whips_on_awnings: number;
  sold: Record<string, string>;
  tugs: number;
};

export type MarketContext = {
  log: YarnLogEntry[];
  tonight: ChainNightStats;
  merchants: MerchantView[];
  yarn: YarnState;
  night: NightView;
  lastNight: ChainNightStats;
  events: ReturnType<typeof detectEvents>;
  requests: MerchantRequest[];
};

const num = (v: string | number | undefined) => Number(v ?? 0);

export async function marketContext(): Promise<MarketContext> {
  const [merchants, yarn, night, log] = await Promise.all([
    view<MerchantView[]>(CONFIG.alley, "merchants"),
    view<YarnState>(CONFIG.yarn, "state"),
    view<NightView>(CONFIG.alley, "night"),
    view<YarnLogEntry[]>(CONFIG.yarn, "log", { from: 0, limit: 500 }),
  ]);
  const nights = [night.night - 3, night.night - 2, night.night - 1].filter((n) => n >= 0);
  const [stats, tonight] = await Promise.all([
    Promise.all(nights.map((n) => view<ChainNightStats>(CONFIG.alley, "night_stats", { night: n }))),
    view<ChainNightStats>(CONFIG.alley, "night_stats", { night: night.night }),
  ]);
  const tom = merchants.find((m) => m.account_id === CONFIG.merchants.tom);
  const lanterns = Object.fromEntries(
    MERCHANT_IDS.map((id) => [id, merchants.find((m) => m.account_id === CONFIG.merchants[id])?.lanterns ?? 0]),
  ) as Record<MerchantId, number>;
  const history: EconNight[] = nights.map((n, i) => ({
    night: n,
    tomFishStock: num(tom?.inventory.fish),
    tomFishCapacity: MERCHANTS.tom.capacity.fish ?? 40,
    thievesEscaped: 0,
    thievesCaught: stats[i].binds,
    daringRuns: stats[i].daring_runs,
    falls: stats[i].falls,
    merchantLanterns: lanterns,
    recordBroken: log.some((e) => e.kind === "record" && e.night === n),
  }));
  const events = detectEvents(history);
  return {
    log,
    tonight,
    merchants,
    yarn,
    night,
    lastNight: stats[stats.length - 1] ?? { daring_runs: 0, falls: 0, safe_runs: 0, binds: 0, whips_on_awnings: 0, sold: {}, tugs: 0 },
    events,
    requests: requestsFrom(merchants, night, events, tonight.binds),
  };
}

const toNums = (r: Partial<Record<string, string>>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v ?? 0)])) as Partial<Record<Item, number>>;

/** Tonight's notice board, from the live merchants (same rules the UI shows). */
export function requestsFrom(
  merchants: MerchantView[],
  night: NightView,
  events: ReturnType<typeof detectEvents>,
  bindsTonight: number,
): MerchantRequest[] {
  const byId = Object.fromEntries(
    MERCHANT_IDS.map((id) => {
      const m = merchants.find((x) => x.account_id === CONFIG.merchants[id]);
      return [id, { open: !!m?.open, stock: toNums(m?.inventory ?? {}), boughtTonight: toNums(m?.bought_tonight ?? {}) }];
    }),
  ) as Parameters<typeof nightlyRequests>[0]["merchants"];
  return nightlyRequests({
    night: night.night,
    merchants: byId,
    activeEvents: events.map((e) => e.kind),
    bindsTonight,
    beasts: night.registered_beasts,
  });
}

