import { restockMerchants } from "@/lib/server/keeper";
import { errorText, json } from "@/lib/server/near";

// Merchant agents check their tills and restock with their own keys (policy in lib/server/keeper.ts).
export async function POST() {
  try {
    return json({ ok: true, decisions: await restockMerchants() });
  } catch (e) {
    return json({ ok: false, error: errorText(e) }, 500);
  }
}
