// Read-only RPC calls. Safe on server and client.
import { JsonRpcProvider } from "near-api-js";
import { CONFIG } from "./config";
import type {
  Beast,
  HistoryEntry,
  Item,
  MerchantView,
  NightView,
  StallView,
  YarnLogEntry,
  YarnParams,
  YarnState,
} from "./types";
import { ITEMS } from "./types";

let provider: JsonRpcProvider | null = null;
export function rpc() {
  provider ??= new JsonRpcProvider({ url: CONFIG.rpcUrl });
  return provider;
}

// Contract reads are shared and briefly remembered: a shop asking for ten prices at once makes one set of
// reads, not a hundred (the public testnet RPC rate-limits bursts). On a 429 we back off and retry.
const READ_TTL_MS = 1500;
const reads = new Map<string, { at: number; value: Promise<unknown> }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rateLimited = (e: unknown) => /-?429|rate limit/i.test(e instanceof Error ? e.message : String(e));

// A second public testnet node to fall back on while the main one rate-limits us.
const FALLBACK_RPC = CONFIG.network === "testnet" ? "https://rpc.testnet.near.org" : null;
let fallback: JsonRpcProvider | null = null;

async function readWithRetry(contractId: string, method: string, args: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const provider = attempt % 2 === 1 && FALLBACK_RPC ? (fallback ??= new JsonRpcProvider({ url: FALLBACK_RPC })) : rpc();
    try {
      return await provider.callFunction({ contractId, method, args });
    } catch (e) {
      if (!rateLimited(e) || attempt >= 4) throw e;
      await sleep(400 * 2 ** attempt + Math.random() * 300);
    }
  }
}

export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const key = `${contractId}|${method}|${JSON.stringify(args)}`;
  const now = Date.now();
  const hit = reads.get(key);
  if (hit && now - hit.at < READ_TTL_MS) return hit.value as Promise<T>;
  const value = readWithRetry(contractId, method, args);
  reads.set(key, { at: now, value });
  value.catch(() => reads.delete(key)); // never remember a failure
  if (reads.size > 500) for (const [k, v] of reads) if (now - v.at >= READ_TTL_MS) reads.delete(k);
  return value as Promise<T>;
}

export const getBeast = (tokenId: string) => view<Beast | null>(CONFIG.alley, "beast", { token_id: tokenId });
export const getBeasts = (from = 0, limit = 100) => view<Beast[]>(CONFIG.alley, "beasts", { from, limit });
export const getBeastsForOwner = (accountId: string) =>
  view<Beast[]>(CONFIG.alley, "beasts_for_owner", { account_id: accountId });
export const getHistory = (tokenId: string, from = 0, limit = 100) =>
  view<HistoryEntry[]>(CONFIG.alley, "history", { token_id: tokenId, from, limit });
export const getMerchants = () => view<MerchantView[]>(CONFIG.alley, "merchants");
export const getStalls = () => view<StallView[]>(CONFIG.alley, "stalls");
export const getNight = () => view<NightView>(CONFIG.alley, "night");

export async function getItemBalances(accountId: string): Promise<Record<Item, number>> {
  const balances = await view<string[]>(CONFIG.alley, "mt_batch_balance_of", {
    account_id: accountId,
    token_ids: [...ITEMS],
  });
  return Object.fromEntries(ITEMS.map((id, i) => [id, Number(balances[i] ?? 0)])) as Record<Item, number>;
}

export const getYarnBalance = async (accountId: string) =>
  Number(await view<string>(CONFIG.yarn, "ft_balance_of", { account_id: accountId }));
export const getYarnParams = () => view<YarnParams>(CONFIG.yarn, "params");
export const getYarnState = () => view<YarnState>(CONFIG.yarn, "state");
export const getYarnLog = (from = 0, limit = 200) => view<YarnLogEntry[]>(CONFIG.yarn, "log", { from, limit });
/** How many entries the log holds. The contract pages from the oldest, so the UI needs this to reach the newest. */
export const getYarnLogLen = () => view<number>(CONFIG.yarn, "log_len", {});
/** What a Beast's own account says it is: `sharded-item-1.0.0`, the Top Level Accounts draft NEP
    for NFT collections whose tokens are real NEAR accounts (houseofstake/tla-contracts,
    docs/sharded-nft-items.md). The account answers for itself; `verifyBeastItem` below checks that
    answer against the alley's own record before anything trusts it. */
export type NftItemInfo = {
  spec: string;
  init: boolean;
  status: "Parked" | "Suspended" | "Expired" | "Frozen" | "Active";
  collection_id: string;
  token_id: string;
  owner_id: string | null;
  rotation_seq: string;
  rotation_epoch: number;
};

export const getBeastItemInfo = (beastAccount: string) => view<NftItemInfo>(beastAccount, "nft_item_info", {});

/** Membership, the way the draft NEP asks for it: ask the account what it is, then refuse unless
    the collection agrees. `collection_id` is only a claim — anyone can name any collection — so the
    check that matters is that `token_id` is the account we actually queried, and that the alley
    names the same owner. */
export async function verifyBeastItem(beastAccount: string): Promise<
  { ok: true; info: NftItemInfo } | { ok: false; why: string }
> {
  let info: NftItemInfo;
  try {
    info = await getBeastItemInfo(beastAccount);
  } catch {
    return { ok: false, why: "That account does not answer as a sharded NFT item." };
  }
  if (info.spec !== "sharded-item-1.0.0") return { ok: false, why: `Unknown item spec ${info.spec}.` };
  // Requirement 1: the item must name itself, so a contract cannot claim to be a different token.
  if (info.token_id !== beastAccount) return { ok: false, why: "That account claims to be a different token." };
  if (info.collection_id !== CONFIG.alley) return { ok: false, why: "That Beast belongs to another collection." };
  // The claim is only load-bearing once the collection confirms it.
  const token = await view<{ owner_id: string } | null>(CONFIG.alley, "nft_token", {
    token_id: beastAccount.split(".")[0],
  }).catch(() => null);
  if (!token) return { ok: false, why: "The alley has no such Beast." };
  if (info.owner_id && token.owner_id !== info.owner_id)
    return { ok: false, why: "The Beast and the alley disagree about who owns it." };
  return { ok: true, info };
}

export const getTuggedTonight = (beastAccount: string) =>
  view<boolean>(CONFIG.yarn, "tugged_tonight", { beast_account: beastAccount });

export type Care = {
  fullness: number;
  happiness: number;
  at_ms: number;
  outfit: string[];
  persona: string;
  thought_credits: number;
  thoughts: number;
};
export type Thought = {
  said: string;
  reply: string;
  model: string;
  chat_id: string;
  request_hash: string;
  response_hash: string;
  signature: string;
  signing_address: string;
  signing_algo: string;
  at_ms: number;
};
export const getCare = (tokenId: string) => view<Care>(CONFIG.alley, "care", { token_id: tokenId });
export async function getThoughts(tokenId: string, last = 20): Promise<Thought[]> {
  const care = await getCare(tokenId);
  return view<Thought[]>(CONFIG.alley, "thoughts", { token_id: tokenId, from: Math.max(0, care.thoughts - last), limit: last });
}
