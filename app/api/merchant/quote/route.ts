import type { Item } from "@/lib/chain/types";
import { makeQuote } from "@/lib/server/market";
import { errorText, json } from "@/lib/server/near";

// A merchant agent prices a trade (lib/economy/pricing.ts) and signs it with its own key.
// The Beast then executes it on chain; the contract checks the signature.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tokenId: string; merchant: string; side: "sell" | "buy"; item: Item; amount: number };
    const result = await makeQuote(body);
    if ("refused" in result) return json({ error: result.refused, reasoning: result.refused }, 409);
    return json(result);
  } catch (e) {
    return json({ error: errorText(e) }, 500);
  }
}
