// Plays one night with the public demo players so the Great Yarn reaches its target:
//   demo1..demo4 cuddle (boop) their own cats; demo5 wakes the keychain cat alley-cat-001 and cuddles it.
// Every transaction is signed by the player's own (public, testnet-only) key; nothing goes through the
// game server. Then, once the night is over, anyone calls `settle` and the good night mints.
//   ./node_modules/.bin/tsx scripts/good-night.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KeyPairString } from "near-api-js";

const ROOT_DIR = resolve(import.meta.dirname, "..");
for (const line of readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const TGAS = BigInt(10) ** BigInt(12);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { Account, KeyPair } = await import("near-api-js");
  const { CONFIG } = await import("../lib/chain/config");
  const { rpc, view } = await import("../lib/chain/view");
  type State = { night: number; night_ends_ms: number; tugs_tonight: number; target_tonight: number; streak: number; total_supply: string; settled_through: number };
  const state = () => view<State>(CONFIG.yarn, "state");

  const demo = JSON.parse(readFileSync(resolve(ROOT_DIR, "public/demo-accounts.json"), "utf8")) as {
    accounts: { accountId: string; secretKey: string; beast: { tokenId: string; keychainSecret: string } | null }[];
  };
  const keychains = JSON.parse(readFileSync(resolve(ROOT_DIR, "scripts/.secrets/beasts.json"), "utf8")) as Record<string, { secret: string }>;

  // Don't start a night that's about to end: all tugs must land in the same night.
  let s = await state();
  const left = s.night_ends_ms - Date.now();
  if (left < 90_000) {
    console.log(`Night ${s.night} ends in ${Math.round(left / 1000)}s; waiting for the next one…`);
    await sleep(left + 5_000);
    s = await state();
  }
  console.log(`Night ${s.night}: ${s.tugs_tonight}/${s.target_tonight} tugs so far.`);

  const player = (id: string, key: string) => new Account(id, rpc(), key as KeyPairString);
  const call = (who: InstanceType<typeof Account>, methodName: string, args: Record<string, unknown>) =>
    who.callFunction({ contractId: CONFIG.alley, methodName, args, gas: TGAS * BigInt(150) });

  for (const d of demo.accounts) {
    const p = player(d.accountId, d.secretKey);
    let token = d.beast?.tokenId;
    let secret = d.beast?.keychainSecret;
    if (!token) {
      // demo5: wake the first keychain cat nobody has woken yet
      for (const [id, k] of Object.entries(keychains)) {
        const b = await view<{ woken: boolean; owner_id: string } | null>(CONFIG.alley, "beast", { token_id: id });
        if (b && (!b.woken || b.owner_id === d.accountId)) {
          token = id;
          secret = k.secret;
          if (!b.woken) {
            await call(p, "wake", { token_id: id, secret, controller_pk: KeyPair.fromRandom("ed25519").getPublicKey().toString() });
            console.log(`  ${d.accountId.split(".")[0]} woke ${id}`);
          }
          break;
        }
      }
    }
    if (!token || !secret) continue;
    try {
      await call(p, "boop", { token_id: token, secret });
      console.log(`  ${d.accountId.split(".")[0]} cuddled ${token}`);
    } catch (e) {
      console.log(`  ${d.accountId.split(".")[0]} could not cuddle ${token}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }

  s = await state();
  console.log(`Night ${s.night}: ${s.tugs_tonight}/${s.target_tonight} tugs.`);
  const night = s.night;
  const wait = s.night_ends_ms - Date.now() + 5_000;
  console.log(`Waiting ${Math.round(wait / 1000)}s for the night to end, then settling…`);
  await sleep(Math.max(0, wait));
  const root = player(CONFIG.root, process.env.NEAR_ROOT_KEY!);
  const out = await root.callFunction({ contractId: CONFIG.yarn, methodName: "settle", args: {}, gas: TGAS * BigInt(150) });
  const hash = (out as { transaction?: { hash?: string } })?.transaction?.hash;
  const log = await view<{ night: number; kind: string; amount: string; accounts: number }[]>(CONFIG.yarn, "log", { from: 0, limit: 500 });
  const tonight = log.filter((e) => e.night === night);
  console.log(`Night ${night} settled:`, tonight.map((e) => `${e.kind} ${e.amount} (${e.accounts} accounts)`).join(", "));
  const after = await state();
  console.log(`streak ${after.streak} · supply ${after.total_supply}${hash ? ` · settle tx ${CONFIG.explorer}/txns/${hash}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
