import { CONFIG } from "@/lib/chain/config";
import type { HistoryEntry } from "@/lib/chain/types";
import { view } from "@/lib/chain/view";
import { json } from "@/lib/server/near";

// Links each diary line to the transaction that wrote it. The alley contract stamps a diary entry with the
// block time of the receipt that ran on it, so we read the alley's receipts from NearBlocks (filtered by
// who sent them: the cat itself, its owners, the referee, $YARN, the studio) and match them by that time.
const API = CONFIG.network === "testnet" ? "https://api-testnet.nearblocks.io/v3" : "https://api.nearblocks.io/v3";
const TTL_MS = 60_000;
const MAX_PAGES = 4;
const cache = new Map<string, { at: number; body: unknown }>();

/** Which contract method wrote each kind of diary entry. */
const METHOD: Record<string, string[]> = {
  born: ["register_beast"],
  woke: ["wake"],
  boop: ["boop"],
  key: ["bind_key"],
  prowl: ["settle_run"],
  thought: ["record_thought"],
  wander: ["wander"],
  home: ["cancel_wander", "end_wander"],
  adopt: ["adopt"],
  feed: ["feed"],
  dress: ["dress"],
  persona: ["set_persona"],
  think: ["ft_on_transfer"],
  sell: ["sell_to_merchant"],
  buy: ["ft_on_transfer"],
  stall: ["open_stall", "close_stall", "ft_on_transfer"],
  rules: ["set_stall_rules"],
  revive: ["ft_on_transfer"],
};

type Receipt = { predecessor_account_id: string; actions: { method?: string | null }[]; included_in_block_timestamp: string; transaction_hash: string };
type Hit = { method: string | null; hash: string };

async function receiptsFrom(predecessor: string, oldestMs: number, into: Map<number, Hit[]>) {
  let next: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ limit: "100", predecessor });
    if (next) q.set("next", next);
    const res = await fetch(`${API}/accounts/${CONFIG.alley}/receipts?${q}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: Receipt[]; meta?: { next_page?: string } };
    const rows = body.data ?? [];
    for (const r of rows) {
      if (r.predecessor_account_id !== predecessor) continue;
      const ms = Math.floor(Number(r.included_in_block_timestamp) / 1e6);
      const list = into.get(ms) ?? [];
      list.push({ method: r.actions.find((a) => a.method)?.method ?? null, hash: r.transaction_hash });
      into.set(ms, list);
    }
    const last = rows[rows.length - 1];
    next = body.meta?.next_page ?? null;
    if (!next || !last || Math.floor(Number(last.included_in_block_timestamp) / 1e6) < oldestMs) return;
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[a-z0-9-]{1,40}$/.test(token)) return json({ error: "Which cat?" }, 400);
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return json(hit.body);

  try {
    const history = await view<HistoryEntry[]>(CONFIG.alley, "history", { token_id: token, from: 0, limit: 200 });
    if (!history.length) return json({ links: {} });
    const oldest = Math.min(...history.map((h) => h.at_ms));
    const senders = new Set<string>([CONFIG.beastAccount(token), CONFIG.root, CONFIG.yarn, CONFIG.studio, ...history.map((h) => h.owner).filter(Boolean)]);
    const byTime = new Map<number, Hit[]>();
    await Promise.all([...senders].map((s) => receiptsFrom(s, oldest, byTime).catch(() => undefined)));

    const links: Record<string, string> = {};
    for (const e of history) {
      const hits = byTime.get(e.at_ms);
      if (!hits?.length) continue;
      const want = METHOD[e.kind];
      const match = (want && hits.find((h) => h.method && want.includes(h.method))) ?? (hits.length === 1 ? hits[0] : undefined);
      if (match) links[`${e.at_ms}|${e.kind}`] = match.hash;
    }
    const body = { links };
    cache.set(token, { at: Date.now(), body });
    return json(body);
  } catch {
    return json({ links: {} });
  }
}
