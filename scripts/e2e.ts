/**
 * End-to-end check against the live testnet deployment. Registers a fresh test Beast unless a token is given.
 *
 *   ./node_modules/.bin/tsx scripts/e2e.ts [token_id]
 *
 * Wakes the Beast for a fresh player, settles a safe and a daring prowl, sells to Old Tom with a
 * merchant-signed quote, buys from Sister Clove, opens a stall, then resells it with wander → adopt
 * to a second player and proves the first player's key no longer works.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
for (const line of readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i)] ??= line.slice(i + 1);
}

let TOKEN = process.argv[2] ?? "";
const TGAS = BigInt(1_000_000_000_000);
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const { Account, KeyPair, actions, nearToYocto } = await import("near-api-js");
  type KeyPairString = import("near-api-js").KeyPairString;
  const { CONFIG } = await import("../lib/chain/config");
  const { rpc, view } = await import("../lib/chain/view");
  const { encodeCalls } = await import("../lib/chain/borsh");
  const { makeQuote } = await import("../lib/server/market");
  const { rootAccount } = await import("../lib/server/near");
  type Beast = import("../lib/chain/types").Beast;

  const { createHash } = await import("node:crypto");
  const root = rootAccount();
  let secret: string;
  if (TOKEN) {
    const secrets = JSON.parse(readFileSync(resolve(ROOT_DIR, "scripts/.secrets/beasts.json"), "utf8"));
    secret = secrets[TOKEN].secret;
  } else {
    // Register a fresh test Beast so the real keychains stay untouched.
    TOKEN = `e2e-${randomBytes(3).toString("hex")}`;
    secret = randomBytes(16).toString("hex");
    await root.transfer({ receiverId: CONFIG.studio, amount: nearToYocto("0.35") });
    const studio = new Account(CONFIG.studio, rpc(), process.env.KEY_STUDIO as KeyPairString);
    await studio.callFunction({
      contractId: CONFIG.alley,
      methodName: "register_beast",
      args: { token_id: TOKEN, name: "Test Cat", media: "/art/cat-neutral.svg", stats: { reach: 5, grip: 5, speed: 5, luck: 5 }, claim_hash: createHash("sha256").update(secret).digest("hex") },
      deposit: nearToYocto("0.3"),
      gas: TGAS * BigInt(150),
    });
  }
  const beastAccount = CONFIG.beastAccount(TOKEN);
  const beast = () => view<Beast>(CONFIG.alley, "beast", { token_id: TOKEN });
  const yarnOf = async (a: string) => Number(await view<string>(CONFIG.yarn, "ft_balance_of", { account_id: a }));
  const itemOf = async (a: string, item: string) => Number(await view<string>(CONFIG.alley, "mt_balance_of", { account_id: a, token_id: item }));

  async function newPlayer(tag: string) {
    const kp = KeyPair.fromRandom("ed25519");
    const id = `e2e${tag}${randomBytes(3).toString("hex")}.${CONFIG.root}`;
    await root.signAndSendTransaction({
      receiverId: id,
      actions: [actions.createAccount(), actions.transfer(nearToYocto("0.4")), actions.addFullAccessKey(kp.getPublicKey())],
    });
    return new Account(id, rpc(), kp.toString() as KeyPairString);
  }

  function asBeast(key: string) {
    const acc = new Account(beastAccount, rpc(), key as KeyPairString);
    return (calls: { receiver_id: string; method_name: string; args: unknown; deposit?: bigint; gas?: number }[]) =>
      acc.signAndSendTransaction({
        receiverId: beastAccount,
        actions: [
          actions.functionCall(
            "execute",
            encodeCalls(
              calls.map((c) => ({
                receiver_id: c.receiver_id,
                method_name: c.method_name,
                args: JSON.stringify(c.args),
                deposit: c.deposit ?? BigInt(0),
                gas: BigInt(c.gas ?? 40) * TGAS,
              })),
            ),
            // Sized to the inner calls: the protocol checks the Beast's balance and key allowance
            // against a pessimistic gas price, so a 300 TGas reservation would need ~0.3 NEAR.
            TGAS * BigInt(Math.min(200, calls.reduce((s, c) => s + (c.gas ?? 40), 0) + 20)),
            BigInt(0),
          ),
        ],
      });
  }

  console.log(`Beast ${TOKEN} on ${CONFIG.alley}\n`);

  // 1. wake
  const alice = await newPlayer("a");
  const ctrlA = KeyPair.fromRandom("ed25519");
  await alice.callFunction({
    contractId: CONFIG.alley,
    methodName: "wake",
    args: { token_id: TOKEN, secret, controller_pk: ctrlA.getPublicKey().toString() },
    gas: TGAS * BigInt(150),
  });
  let b = await beast();
  check("wake: scanner owns the Beast", b.owner_id === alice.accountId, alice.accountId);
  check("wake: nine links lit", b.lives === 9);
  const keysA = (await rpc().viewAccessKeyList({ accountId: beastAccount })).keys.map((k) => k.public_key.toString());
  check("wake: controller key added to the Beast's own account", keysA.includes(ctrlA.getPublicKey().toString()), `${keysA.length} key(s)`);

  // 2. prowls (referee)
  const settle = (args: Record<string, unknown>) =>
    root.callFunction({ contractId: CONFIG.alley, methodName: "settle_run", args: { token_id: TOKEN, mark: null, whips_on_awning: {}, binds: 0, ...args }, gas: TGAS * BigInt(150) });
  await settle({ daring: false, rooftops: 5, haul: [["fish", "4"], ["bell", "2"]], fell: false, binds: 1 });
  check("safe run: loot minted to the Beast account", (await itemOf(beastAccount, "fish")) === 4);
  await settle({ daring: true, rooftops: 6, haul: [["moonstone", "1"]], fell: true, mark: "scar" });
  b = await beast();
  check("daring fall: one link goes dark", b.lives === 8);
  check("daring fall: leaves a mark", b.marks.some((m) => m.kind === "scar"));
  const yarnState = await view<{ tugs_tonight: number }>(CONFIG.yarn, "state");
  check("prowl tugged the yarn for tonight", yarnState.tugs_tonight >= 1, `tugs ${yarnState.tugs_tonight}`);

  // 3. sell fish to Old Tom with a merchant-signed quote
  const execA = asBeast(ctrlA.toString());
  const sell = await makeQuote({ tokenId: TOKEN, merchant: "tom", side: "sell", item: "fish", amount: 3 });
  if ("refused" in sell) {
    check("Old Tom quotes fish", false, sell.refused);
  } else {
    console.log(`        Old Tom: "${sell.reasoning}"`);
    const before = await yarnOf(beastAccount);
    await execA([{ receiver_id: CONFIG.alley, method_name: "sell_to_merchant", args: { quote: sell.quote, signature: sell.signature }, gas: 80 }]);
    const after = await yarnOf(beastAccount);
    const total = sell.price_per * 3;
    check("sold 3 fish: YARN lands in the Beast's account (minus 2% fee)", after - before === total - Math.floor((total * 200) / 10000), `${before} -> ${after}`);
    // replay must fail
    let replay = false;
    await execA([{ receiver_id: CONFIG.alley, method_name: "sell_to_merchant", args: { quote: sell.quote, signature: sell.signature } }]).then(
      () => (replay = true),
      () => {},
    );
    check("a used quote cannot be replayed", (await yarnOf(beastAccount)) === after || !replay);
  }

  // 4. buy catnip from Sister Clove
  const buy = await makeQuote({ tokenId: TOKEN, merchant: "clove", side: "buy", item: "catnip", amount: 1 });
  if ("refused" in buy) {
    check("Clove quotes catnip", false, buy.refused);
  } else {
    await execA([
      {
        receiver_id: CONFIG.yarn,
        method_name: "ft_transfer_call",
        args: { receiver_id: CONFIG.alley, amount: String(buy.price_per), msg: JSON.stringify({ buy_merchant: { quote: buy.quote, signature: buy.signature } }) },
        deposit: BigInt(1),
        gas: 150,
      },
    ]);
    check("bought catnip from Clove", (await itemOf(beastAccount, "catnip")) === 1, `${buy.price_per} YARN`);
  }

  // 5. stall
  const stalls = await view<{ slot: number; token_id: string | null }[]>(CONFIG.alley, "stalls");
  const free = stalls.find((s) => !s.token_id)?.slot ?? 0;
  await execA([
    { receiver_id: CONFIG.alley, method_name: "open_stall", args: { slot: free } },
    { receiver_id: CONFIG.alley, method_name: "set_stall_rules", args: { rules: { floors: { bell: "30" }, never_sell: ["moonstone"] } } },
  ]);
  const st = (await view<{ slot: number; token_id: string | null; lanterns: number }[]>(CONFIG.alley, "stalls"))[free];
  check("stall opened with nine lanterns", st.token_id === TOKEN && st.lanterns === 9, `slot ${free}`);

  // 6. wander -> frozen
  const yarnBeforeSale = await yarnOf(beastAccount);
  await alice.callFunction({ contractId: CONFIG.alley, methodName: "wander", args: { token_id: TOKEN, price: nearToYocto("0.1").toString() }, deposit: BigInt(1), gas: TGAS * BigInt(150) });
  check("wander: listed", !!(await beast()).wander);
  let frozenBlocked = false;
  await execA([{ receiver_id: CONFIG.alley, method_name: "close_stall", args: {} }]).then(
    () => {},
    () => (frozenBlocked = true),
  );
  // execute's own panic surfaces as a failed receipt; either way the stall must still be open
  const still = (await view<{ token_id: string | null }[]>(CONFIG.alley, "stalls"))[free];
  check("wander: seller cannot move anything out (wallet frozen)", still.token_id === TOKEN, frozenBlocked ? "rejected" : "no effect");

  // 7. adopt by bob
  const bob = await newPlayer("b");
  const ctrlB = KeyPair.fromRandom("ed25519");
  const studioBefore = BigInt((await rpc().viewAccount({ accountId: CONFIG.studio })).amount);
  await bob.callFunction({
    contractId: CONFIG.alley,
    methodName: "adopt",
    args: { token_id: TOKEN, secret, controller_pk: ctrlB.getPublicKey().toString() },
    deposit: nearToYocto("0.1"),
    gas: TGAS * BigInt(250),
  });
  b = await beast();
  check("adopt: buyer owns the Beast", b.owner_id === bob.accountId);
  const keysAfter = (await rpc().viewAccessKeyList({ accountId: beastAccount })).keys.map((k) => k.public_key.toString());
  check(
    "adopt: old key deleted, only the buyer's key remains",
    keysAfter.length === 1 && keysAfter[0] === ctrlB.getPublicKey().toString(),
    `${keysAfter.length} key(s)`,
  );
  check("adopt: lives, marks and YARN moved with the Beast", b.lives === 8 && b.marks.length >= 1 && (await yarnOf(beastAccount)) === yarnBeforeSale);
  const studioAfter = BigInt((await rpc().viewAccount({ accountId: CONFIG.studio })).amount);
  check("adopt: maker received the 10% royalty", studioAfter - studioBefore === nearToYocto("0.01"), `${studioAfter - studioBefore} yocto`);

  let oldKeyWorks = true;
  await execA([{ receiver_id: CONFIG.alley, method_name: "close_stall", args: {} }]).catch(() => (oldKeyWorks = false));
  check("adopt: the seller's old key is rejected", !oldKeyWorks);
  await asBeast(ctrlB.toString())([{ receiver_id: CONFIG.alley, method_name: "close_stall", args: {} }]);
  check("adopt: the buyer's key controls the Beast", !(await view<{ token_id: string | null }[]>(CONFIG.alley, "stalls"))[free].token_id);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
