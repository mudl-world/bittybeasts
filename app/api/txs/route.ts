import { CONFIG } from "@/lib/chain/config";
import { json } from "@/lib/server/near";

// Transaction history from NearBlocks' indexer (an RPC node can't list an account's past transactions).
// Cached for a few seconds per query so many viewers don't hit the indexer's rate limit.
const API = CONFIG.network === "testnet" ? "https://api-testnet.nearblocks.io/v3" : "https://api.nearblocks.io/v3";
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; body: unknown }>();

type Raw = {
  transaction_hash: string;
  block_timestamp: string;
  signer_account_id: string;
  receiver_account_id: string;
  actions: { action: string; method?: string | null }[];
  actions_agg?: { deposit?: string };
  outcomes?: { status?: boolean | null };
  outcomes_agg?: { transaction_fee?: string };
};

export type Tx = {
  hash: string;
  at_ms: number;
  signer: string;
  receiver: string;
  actions: { action: string; method: string | null }[];
  deposit: string;
  fee: string;
  ok: boolean | null;
};

const ROOT_SUFFIX = `.${CONFIG.root}`;
const allowed = (a: string) => a === CONFIG.root || a.endsWith(ROOT_SUFFIX);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const account = url.searchParams.get("account") ?? CONFIG.alley;
  const next = url.searchParams.get("next");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  // Only this game's accounts: the page is a window on Bitty Beasts, not a general explorer.
  if (!allowed(account)) return json({ error: "Not a Bitty Beasts account" }, 400);

  const key = `${account}|${next ?? ""}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return json(hit.body);

  const q = new URLSearchParams({ limit: String(limit) });
  if (next) q.set("next", next);
  try {
    const res = await fetch(`${API}/accounts/${encodeURIComponent(account)}/txns?${q}`, {
      headers: { Accept: "application/json", ...(process.env.NEARBLOCKS_API_KEY ? { Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {}) },
      cache: "no-store",
    });
    if (!res.ok) return json({ error: `The indexer said ${res.status}. Try again in a moment.` }, 502);
    const data = (await res.json()) as { data?: Raw[]; meta?: { next_page?: string } };
    const body = {
      account,
      next: data.meta?.next_page ?? null,
      txs: (data.data ?? []).map(
        (t): Tx => ({
          hash: t.transaction_hash,
          at_ms: Math.floor(Number(t.block_timestamp) / 1e6),
          signer: t.signer_account_id,
          receiver: t.receiver_account_id,
          actions: t.actions.map((a) => ({ action: a.action, method: a.method ?? null })),
          deposit: t.actions_agg?.deposit ?? "0",
          fee: t.outcomes_agg?.transaction_fee ?? "0",
          ok: t.outcomes?.status ?? null,
        }),
      ),
    };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 300) for (const [k, v] of cache) if (Date.now() - v.at > TTL_MS) cache.delete(k);
    return json(body);
  } catch {
    return json({ error: "Couldn't reach the indexer." }, 502);
  }
}
