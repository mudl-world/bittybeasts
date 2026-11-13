// Server-only. The keeper winds the Lane's clock so the world moves without anyone pressing a button:
//   1. alley.close_night: dark stalls for empty tills, rent, Clove's brewing, reset tonight's counters
//   2. yarn.settle: mint on good nights, burn and lose a life on missed ones, the Long Dark
//   3. each merchant agent decides, with its own key, whether to restock its till
// Both contract calls are public and idempotent; the keeper just makes sure someone calls them.
import { CONFIG } from "@/lib/chain/config";
import type { MerchantView, NightView, YarnState } from "@/lib/chain/types";
import { view } from "@/lib/chain/view";
import { MERCHANT_IDS, type MerchantId } from "@/lib/economy/pricing";
import { errorText, merchantAccount, rootAccount } from "./near";

const TGAS = BigInt(1_000_000_000_000);
/** Don't wind more than once per this many ms per server instance (visits trigger it too). */
const MIN_INTERVAL_MS = 60_000;
let lastRun = 0;

// Each merchant agent's restock policy, in plain words:
// - Old Tom tops up only a little, and only when the till is nearly dry. Stingy.
// - Miso keeps a comfortable float for her regulars.
// - Bandit always has cash on hand.
// - Sister Clove keeps a fixed, fair float.
// A merchant never spends below its reserve; once its purse runs low, its till runs dry,
// close_night turns its lights out, and only players can revive it.
export const RESTOCK_POLICY: Record<MerchantId, { below: number; topUp: number; reserve: number }> = {
  tom: { below: 20, topUp: 60, reserve: 1_700 },
  miso: { below: 120, topUp: 200, reserve: 1_000 },
  bandit: { below: 200, topUp: 400, reserve: 400 },
  clove: { below: 100, topUp: 150, reserve: 800 },
};

export type KeeperReport = { skipped?: string; closed?: string; settled?: string; merchants: { merchant: MerchantId; action: string }[] };

export async function restockMerchants(): Promise<KeeperReport["merchants"]> {
  const out: KeeperReport["merchants"] = [];
  const merchants = await view<MerchantView[]>(CONFIG.alley, "merchants");
  for (const id of MERCHANT_IDS) {
    const m = merchants.find((x) => x.account_id === CONFIG.merchants[id]);
    if (!m || m.retired) continue;
    const p = RESTOCK_POLICY[id];
    const till = Number(m.till);
    if (!m.open || till >= p.below) {
      out.push({ merchant: id, action: m.open ? "till is fine" : "lights out: waiting for investors" });
      continue;
    }
    const purse = Number(await view<string>(CONFIG.yarn, "ft_balance_of", { account_id: CONFIG.merchants[id] }));
    const amount = Math.min(p.topUp, purse - p.reserve);
    if (amount <= 0) {
      out.push({ merchant: id, action: "purse at reserve: not restocking" });
      continue;
    }
    try {
      await merchantAccount(id).callFunction({
        contractId: CONFIG.yarn,
        methodName: "ft_transfer_call",
        args: { receiver_id: CONFIG.alley, amount: String(amount), msg: JSON.stringify({ till: {} }) },
        deposit: BigInt(1),
        gas: BigInt(100) * TGAS,
      });
      out.push({ merchant: id, action: `restocked till with ${amount} YARN` });
    } catch (e) {
      out.push({ merchant: id, action: `restock failed: ${errorText(e)}` });
    }
  }
  return out;
}

export async function runKeeper({ force = false } = {}): Promise<KeeperReport> {
  const now = Date.now();
  if (!force && now - lastRun < MIN_INTERVAL_MS) return { skipped: "wound recently", merchants: [] };
  lastRun = now;

  const report: KeeperReport = { merchants: [] };
  const [night, yarn] = await Promise.all([
    view<NightView>(CONFIG.alley, "night"),
    view<YarnState & { settled_through: number }>(CONFIG.yarn, "state"),
  ]);
  const root = rootAccount();
  if (night.closed_through < night.night) {
    try {
      await root.callFunction({ contractId: CONFIG.alley, methodName: "close_night", args: {}, gas: BigInt(150) * TGAS });
      report.closed = `closed market nights through ${night.night - 1}`;
    } catch (e) {
      report.closed = `close_night failed: ${errorText(e)}`;
    }
  }
  if (yarn.settled_through < yarn.night) {
    try {
      await root.callFunction({ contractId: CONFIG.yarn, methodName: "settle", args: {}, gas: BigInt(150) * TGAS });
      report.settled = `settled $YARN nights through ${yarn.night - 1}`;
    } catch (e) {
      report.settled = `settle failed: ${errorText(e)}`;
    }
  }
  report.merchants = await restockMerchants();
  return report;
}
