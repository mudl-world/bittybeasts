// Republishes beast-wallet as a NEP-591 global contract, upgrading every Beast account at once.
//
//   ./node_modules/.bin/tsx scripts/republish-wallet.ts            # dry run: shows what would change
//   ./node_modules/.bin/tsx scripts/republish-wallet.ts --publish  # actually publish
//
// Beast accounts reference the wallet *by account id* (`use_global_contract_by_account_id` in
// contracts/alley/src/lib.rs), not by code hash, so publishing new code under wallet.ROOT changes
// the code every existing Beast runs — no per-account migration, no alley upgrade.
//
// That is also the risk: it changes all of them at once, including Beasts people own. The new
// state fields are `#[borsh(default)]`, so accounts written with the older five-field layout still
// deserialize (owner = None, rotation counters = 0) and fill in on their next control change. This
// script checks a sample of live Beasts before and after to prove that actually holds.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { actions } from "near-api-js";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
) as Record<string, string>;

const ROOT = env.NEXT_PUBLIC_ROOT_ACCOUNT;
const WALLET = `wallet.${ROOT}`;
const ALLEY = `alley.${ROOT}`;
const WASM = resolve(ROOT_DIR, "contracts/target/near/beast_wallet/beast_wallet.wasm");
// test.rpc.fastnear.com, not rpc.testnet.near.org: the latter is deprecated and rate-limits a
// burst of per-account reads, which made the after-check report working Beasts as broken.
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const publish = process.argv.includes("--publish");

/** Ask a Beast account what it is. Returns null when the method isn't deployed yet. */
async function itemInfo(account: string) {
  try {
    const r = await provider.callFunction({ contractId: account, method: "nft_item_info", args: {} });
    return r as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The old view, present in both builds: proves state still deserializes after the swap. */
async function info(account: string) {
  try {
    await provider.callFunction({ contractId: account, method: "info", args: {} });
    return true;
  } catch {
    return false;
  }
}

/** Every Beast in the collection, so the after-check covers what the publish actually changed. */
async function allBeasts(): Promise<string[]> {
  const total = Number((await provider.callFunction({ contractId: ALLEY, method: "nft_total_supply", args: {} })) ?? 0);
  const out: string[] = [];
  for (let from = 0; from < total; from += 50) {
    const page = (await provider.callFunction({
      contractId: ALLEY,
      method: "nft_tokens",
      args: { from_index: String(from), limit: 50 },
    })) as { token_id: string }[];
    out.push(...page.map((t) => `${t.token_id}.${ALLEY}`));
  }
  return out;
}

async function sampleBeasts(limit: number): Promise<string[]> {
  const tokens = (await provider.callFunction({ contractId: ALLEY, method: "nft_tokens", args: { from_index: "0", limit } })) as {
    token_id: string;
  }[];
  return tokens.map((t) => `${t.token_id}.${ALLEY}`);
}

async function main() {
  // A dry run still works without the wasm: it is there to show the current state of live Beasts.
  let wasm: Buffer | null = null;
  try {
    wasm = readFileSync(WASM);
  } catch {
    if (publish) throw new Error(`No wasm at ${WASM}. Build it first:\n  cd contracts/beast-wallet && cargo near build non-reproducible-wasm --no-abi`);
  }
  console.log(`\nbeast_wallet.wasm  ${wasm ? `${(wasm.length / 1024).toFixed(1)} KB` : "not built yet"}`);
  console.log(`publishing under   ${WALLET}`);
  console.log(`mode               ${publish ? "PUBLISH (writes to chain)" : "dry run"}\n`);

  const beasts = await sampleBeasts(5);
  console.log("Before:");
  for (const b of beasts) {
    const [ok, item] = await Promise.all([info(b), itemInfo(b)]);
    console.log(`  ${b.padEnd(46)} state:${ok ? "ok" : "FAIL"}  nft_item_info:${item ? "yes" : "not deployed"}`);
  }

  if (!publish) {
    console.log("\nDry run. Re-run with --publish to actually republish.\n");
    return;
  }

  const wallet = new Account(WALLET, provider, env.KEY_WALLET as KeyPairString);
  console.log(`\nPublishing…`);
  const out = await wallet.signAndSendTransaction({
    receiverId: WALLET,
    actions: [actions.deployGlobalContract(wasm!, "accountId")],
  });
  console.log(`  tx ${out.transaction.hash}`);

  // Check every Beast, not the sample: the sample was only there to show the "before" state, and
  // a republish changes all of them at once. A Beast whose state stopped decoding would panic on
  // `info`, taking its owner's YARN and items with it.
  console.log("\nAfter (every Beast):");
  const all = await allBeasts();
  let broke = 0;
  let answering = 0;
  for (const b of all) {
    // Sequential, with a pause: a burst of reads gets rate-limited, and a throttled read is
    // indistinguishable from a broken Beast unless you slow down.
    const ok = await info(b);
    const item = await itemInfo(b);
    if (!ok) broke++;
    if (item) answering++;
    const spec = item ? `${item.spec} owner=${item.owner_id ?? "null"} status=${JSON.stringify(item.status)}` : "MISSING";
    console.log(`  ${b.padEnd(46)} state:${ok ? "ok" : "FAIL"}  ${spec}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\n  ${all.length} Beasts · ${all.length - broke} still readable · ${answering} answering nft_item_info`);
  console.log(
    broke === 0
      ? "\nEvery Beast still deserializes, and now answers the sharded-item standard.\n"
      : `\n${broke} Beast(s) failed to read back. Their stored state no longer decodes under the new\ncode — republish the previous wasm under ${WALLET} to put them back.\n`,
  );
  process.exit(broke === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
