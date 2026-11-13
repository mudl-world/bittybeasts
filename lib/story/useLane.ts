"use client";
// One read of the whole Lane for the story screens: the market, tonight's requests,
// the Ages, and the Ledger. Everything comes from contract views.
import { CONFIG } from "@/lib/chain/config";
import { getBeasts, getHistory, view } from "@/lib/chain/view";
import { marketContext, type MarketContext } from "@/lib/economy/live";
import { useAsync } from "@/lib/ui/useAsync";
import { agesFrom, tonightStories, writeLedger, type Age, type BeastDiary, type Edition, type NightStatsView, type Story } from "./ledger";

export type Lane = {
  market: MarketContext;
  ages: Age[];
  ledger: Edition[];
  tonight: Story[];
};

const LEDGER_NIGHTS = 12;

export async function loadLane(): Promise<Lane> {
  const market = await marketContext();
  const { night } = market;
  const nights = Array.from({ length: LEDGER_NIGHTS }, (_, i) => night.night - 1 - i).filter((n) => n >= 0);
  const [statsList, beasts] = await Promise.all([
    Promise.all(nights.map((n) => view<NightStatsView>(CONFIG.alley, "night_stats", { night: n }).catch(() => null))),
    getBeasts(0, 100).catch(() => []),
  ]);
  const diaries: BeastDiary[] = await Promise.all(
    beasts
      .filter((b) => b.woken)
      .map(async (b) => ({ name: b.name, entries: await getHistory(b.token_id, 0, 200).catch(() => []) })),
  );
  const stats: Record<number, NightStatsView> = {};
  nights.forEach((n, i) => {
    if (statsList[i]) stats[n] = statsList[i];
  });
  const ages = agesFrom(market.log, night.night);
  return {
    market,
    ages,
    ledger: writeLedger({ log: market.log, stats, diaries, current: night, ages, nights: LEDGER_NIGHTS }),
    tonight: tonightStories({ yarn: market.yarn, merchants: market.merchants, requests: market.requests, events: market.events }),
  };
}

/** Ask the server's keeper to wind the clock (close finished nights, settle $YARN) before reading. */
async function windClock(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/keeper", { method: "POST", signal: AbortSignal.timeout(12_000) });
  } catch {
    // The keeper is best-effort; the Lane still reads fine without it.
  }
}

export function useLane(refreshKey: number = 0) {
  return useAsync(() => windClock().then(loadLane), [refreshKey]);
}
