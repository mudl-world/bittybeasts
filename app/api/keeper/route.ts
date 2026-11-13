import { connection } from "next/server";
import { runKeeper } from "@/lib/server/keeper";
import { errorText, json } from "@/lib/server/near";

// Winds the Lane's clock: closes finished market nights, settles $YARN, lets merchants restock.
// GET is for a scheduler (cron); POST is what the game pings when someone opens the alley or the Ledger.
// Both are rate-limited inside runKeeper, and every call it makes is a public, idempotent contract method.
async function wind() {
  await connection(); // always at request time, never prerendered at build
  try {
    return json({ ok: true, ...(await runKeeper()) });
  } catch (e) {
    return json({ ok: false, error: errorText(e) }, 500);
  }
}

export const GET = wind;
export const POST = wind;
