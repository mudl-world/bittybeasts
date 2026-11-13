// Merchant agents: read the live alley, run pricing.ts, and sign quotes with the merchant's own key.
import { CONFIG } from "@/lib/chain/config";
import type { Beast, HistoryEntry, Item, Quote } from "@/lib/chain/types";
import { view } from "@/lib/chain/view";
import { marketContext } from "@/lib/economy/live";
import { MERCHANT_IDS, MERCHANTS, quotePrice, type MerchantId, type PricingInput } from "@/lib/economy/pricing";
import { openRequestFor } from "@/lib/economy/requests";
import { merchantIdFor, merchantKey } from "./near";

/** Supply the prices in pricing.ts were set against: genesis treasury + four merchant purses. */
const YARN_BASELINE = 10_000 + 4 * 2_000;
const toNums = (r: Partial<Record<string, string>>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v ?? 0)])) as Partial<Record<Item, number>>;
const QUOTE_TTL_MS = 90_000;

export async function makeQuote(params: {
  tokenId: string;
  merchant: string;
  side: "sell" | "buy";
  item: Item;
  amount: number;
}): Promise<{ quote: Quote; signature: string; price_per: number; reasoning: string; factors: { label: string; effect: string }[] } | { refused: string }> {
  const id = (MERCHANT_IDS as string[]).includes(params.merchant)
    ? (params.merchant as MerchantId)
    : merchantIdFor(params.merchant);
  if (!id) return { refused: "No such merchant on Lantern Lane." };
  if (!Number.isInteger(params.amount) || params.amount < 1 || params.amount > 50) return { refused: "Pick 1 to 50." };

  const [ctx, beast, history] = await Promise.all([
    marketContext(),
    view<Beast | null>(CONFIG.alley, "beast", { token_id: params.tokenId }),
    view<HistoryEntry[]>(CONFIG.alley, "history", { token_id: params.tokenId, from: 0, limit: 200 }),
  ]);
  if (!beast) return { refused: "No such Beast." };
  const account = CONFIG.merchants[id];
  const m = ctx.merchants.find((x) => x.account_id === account);
  if (!m) return { refused: "That merchant isn't on the lane." };

  const openMerchants = MERCHANT_IDS.filter((mid) => ctx.merchants.find((x) => x.account_id === CONFIG.merchants[mid])?.open);

  const input: PricingInput = {
    merchant: id,
    side: params.side,
    item: params.item,
    amount: params.amount,
    beastName: beast.name,
    reputation: beast.reputation[account] ?? 0,
    merchantStock: toNums(m.inventory),
    capacity: MERCHANTS[id].capacity,
    till: Number(m.till),
    lanterns: m.open ? m.lanterns : 0,
    openMerchants,
    soldTonight: toNums(m.bought_tonight),
    yarnSupply: Number(ctx.yarn.total_supply),
    yarnBaseline: YARN_BASELINE,
    festivalTonight: ctx.yarn.festival,
    festivalTomorrow: ctx.yarn.longest > 0 && ctx.yarn.streak === ctx.yarn.longest,
    fallsLastNight: ctx.lastNight.falls,
    daringRunsLastNight: ctx.lastNight.daring_runs,
    activeEvents: ctx.events.map((e) => e.kind),
    requestRemaining: openRequestFor(ctx.requests, id, params.item)?.remaining ?? 0,
    regularVisits: history.filter((h) => (h.kind === "sell" || h.kind === "buy") && h.text.includes(m.name)).length,
  };
  const priced = quotePrice(input);
  if (priced.price_per <= 0) return { refused: priced.reasoning };

  const quote: Quote = {
    merchant: account,
    beast: beast.account_id,
    side: params.side,
    item: params.item,
    amount: String(params.amount),
    price_per: String(priced.price_per),
    expires_ms: Date.now() + QUOTE_TTL_MS,
    nonce: Date.now() * 1000 + Math.floor(Math.random() * 1000),
  };
  // Key order must match the Rust `Quote` struct: the contract re-serialises and verifies these bytes.
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      merchant: quote.merchant,
      beast: quote.beast,
      side: quote.side,
      item: quote.item,
      amount: quote.amount,
      price_per: quote.price_per,
      expires_ms: quote.expires_ms,
      nonce: quote.nonce,
    }),
  );
  const { signature } = merchantKey(id).sign(bytes);
  return {
    quote,
    signature: Buffer.from(signature).toString("base64"),
    price_per: priced.price_per,
    reasoning: priced.reasoning,
    factors: priced.factors,
  };
}
