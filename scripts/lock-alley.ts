// IRREVERSIBLE. Locks the alley contract: checks the deployed code is exactly the local build, then
// deletes every full-access key on the alley account. After this nobody (including us) can upgrade the
// alley, so the only account allowed to call $YARN's `tug` runs fixed, published code, and $YARN's
// "no admin" holds end to end. Run it only after the final upgrade:
//   ./node_modules/.bin/tsx scripts/lock-alley.ts --yes-lock-forever
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

/** base58 (Bitcoin alphabet), as NEAR prints code hashes. */
function base58(bytes: Uint8Array): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (n > BigInt(0)) {
    out = A[Number(n % BigInt(58))] + out;
    n /= BigInt(58);
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

const ROOT_DIR = resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

async function main() {
  if (!process.argv.includes("--yes-lock-forever")) {
    console.log("This deletes the alley's keys forever. Re-run with --yes-lock-forever to do it.");
    return;
  }
  const provider = new JsonRpcProvider({ url: env.NEXT_PUBLIC_RPC_URL ?? "https://test.rpc.fastnear.com" });
  const alley = `alley.${env.NEXT_PUBLIC_ROOT_ACCOUNT}`;

  const local = base58(createHash("sha256").update(readFileSync(resolve(ROOT_DIR, "contracts/target/near/alley/alley.wasm"))).digest());
  const state = (await provider.viewAccount({ accountId: alley })) as unknown as { code_hash: string };
  if (state.code_hash !== local) throw new Error(`Deployed code ${state.code_hash} is not the local build ${local}. Upgrade first.`);

  const list = (await provider.viewAccessKeyList({ accountId: alley })) as unknown as { keys: { public_key: string; access_key: { permission: unknown } }[] };
  const full = list.keys.filter((k) => k.access_key.permission === "FullAccess").map((k) => k.public_key);
  if (!full.length) return console.log(`${alley} has no full-access keys: already locked.`);

  const acc = new Account(alley, provider, env.KEY_ALLEY as KeyPairString);
  for (const pk of full) await acc.deleteKey(pk);
  console.log(`Locked ${alley}: deleted ${full.length} full-access key(s). Code hash ${local}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
