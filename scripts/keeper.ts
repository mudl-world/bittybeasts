// Keeps the Lane turning while you demo or sleep: winds the clock once a minute.
//   set -a; source .env.local; set +a; ./node_modules/.bin/tsx scripts/keeper.ts
// (The deployed app does the same thing on /api/keeper, from a cron or whenever someone visits.)
import { runKeeper } from "../lib/server/keeper";

async function tick() {
  try {
    const r = await runKeeper({ force: true });
    const bits = [r.closed, r.settled, ...r.merchants.filter((m) => !/fine|waiting/.test(m.action)).map((m) => `${m.merchant}: ${m.action}`)].filter(Boolean);
    console.log(new Date().toISOString(), bits.length ? bits.join(" · ") : "nothing to do");
  } catch (e) {
    console.error(new Date().toISOString(), e instanceof Error ? e.message : e);
  }
}

tick().then(() => setInterval(tick, 60_000));
