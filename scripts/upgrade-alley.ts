/**
 * Redeploys the alley contract code (state is kept). $YARN cannot be upgraded: its key is gone.
 *   ./node_modules/.bin/tsx scripts/upgrade-alley.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, type KeyPairString, actions } from "near-api-js";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const provider = new JsonRpcProvider({ url: env.NEXT_PUBLIC_RPC_URL ?? "https://test.rpc.fastnear.com" });
const alley = `alley.${env.NEXT_PUBLIC_ROOT_ACCOUNT}`;
const acc = new Account(alley, provider, env.KEY_ALLEY as KeyPairString);
acc
  .signAndSendTransaction({
    receiverId: alley,
    actions: [
      actions.deployContract(readFileSync(resolve(ROOT_DIR, "contracts/target/near/alley/alley.wasm"))),
      // One-time setup for deployments made before the cat room: stock Miso's wardrobe (no-op if stocked).
      actions.functionCall("stock_wardrobe", {}, BigInt(50) * BigInt(10) ** BigInt(12), BigInt(0)),
    ],
  })
  .then(() => console.log(`redeployed ${alley}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
