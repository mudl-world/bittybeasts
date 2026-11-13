// End-to-end check of the cat room against a running server and the live testnet contracts:
// a new player adopts a kitten, gets the welcome gifts, feeds it, buys and wears a hat, gives it a
// personality, buys thoughts with the kitten's own YARN, and talks to it through NEAR AI.
//   1. start the app:   pnpm build && pnpm start -p 3311   (or pnpm dev)
//   2. run:             BASE_URL=http://localhost:3311 ./node_modules/.bin/tsx scripts/e2e-room.ts
// The talk step needs NEAR_AI_API_KEY on the server; without it the check reports the server's answer.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { KeyPairString } from "near-api-js";

const ROOT_DIR = resolve(import.meta.dirname, "..");
for (const line of readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}
const BASE = process.env.BASE_URL ?? "http://localhost:3311";
const TGAS = BigInt(1_000_000_000_000);
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const { Account, KeyPair, actions, nearToYocto } = await import("near-api-js");
  const { CONFIG } = await import("../lib/chain/config");
  const { rpc, view } = await import("../lib/chain/view");
  const { encodeCalls } = await import("../lib/chain/borsh");
  const { makeQuote } = await import("../lib/server/market");
  const { rootAccount } = await import("../lib/server/near");

  // A fresh player, the way email sign-in makes one.
  const kp = KeyPair.fromRandom("ed25519");
  const playerId = `room${randomBytes(4).toString("hex")}.${CONFIG.root}`;
  await rootAccount().signAndSendTransaction({
    receiverId: playerId,
    actions: [actions.createAccount(), actions.transfer(nearToYocto("0.4")), actions.addFullAccessKey(kp.getPublicKey())],
  });
  const player = new Account(playerId, rpc(), kp.toString() as KeyPairString);
  console.log(`Player ${playerId}\n`);

  async function signed<T>(path: string, payload: unknown): Promise<{ status: number; body: T }> {
    const body = JSON.stringify(payload);
    const ts = Date.now();
    const digest = createHash("sha256").update(body).digest("hex");
    const { signature } = kp.sign(new TextEncoder().encode(`${path}|${playerId}|${ts}|${digest}`));
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: playerId, publicKey: kp.getPublicKey().toString(), ts, signature: Buffer.from(signature).toString("base64"), body }),
    });
    return { status: res.status, body: (await res.json()) as T };
  }

  // 1. adopt a kitten
  const adopt = await signed<{ ok: boolean; tokenId: string; secret: string; error?: string }>("/api/cat/adopt", { name: "Tester" });
  check("adopt: the server made a kitten", adopt.body.ok, adopt.body.error ?? adopt.body.tokenId);
  if (!adopt.body.ok) return;
  const token = adopt.body.tokenId;
  const kitten = CONFIG.beastAccount(token);
  const controller = KeyPair.fromRandom("ed25519");
  await player.callFunction({
    contractId: CONFIG.alley,
    methodName: "wake",
    args: { token_id: token, secret: adopt.body.secret, controller_pk: controller.getPublicKey().toString() },
    gas: TGAS * BigInt(150),
  });
  const beast = await view<{ owner_id: string; lives: number }>(CONFIG.alley, "beast", { token_id: token });
  check("wake: the player owns the kitten, nine lives", beast.owner_id === playerId && beast.lives === 9);
  const again = await signed<{ ok: boolean }>("/api/cat/adopt", { name: "Greedy" });
  check("adopt: one kitten per player", !again.body.ok && again.status === 409);

  const yarnOf = async () => Number(await view<string>(CONFIG.yarn, "ft_balance_of", { account_id: kitten }));
  const itemOf = async (item: string) => Number(await view<string>(CONFIG.alley, "mt_balance_of", { account_id: kitten, token_id: item }));
  const care = () => view<{ fullness: number; happiness: number; outfit: string[]; persona: string; thought_credits: number; thoughts: number }>(CONFIG.alley, "care", { token_id: token });
  check("welcome: Sister Clove's purse arrived", (await yarnOf()) === 15, `${await yarnOf()} YARN`);
  check("welcome: Old Tom's two fish arrived", (await itemOf("fish")) === 2);

  const exec = (calls: { receiver_id: string; method_name: string; args: unknown; deposit?: bigint; gas?: number }[]) =>
    new Account(kitten, rpc(), controller.toString() as KeyPairString).signAndSendTransaction({
      receiverId: kitten,
      actions: [
        actions.functionCall(
          "execute",
          encodeCalls(calls.map((c) => ({ receiver_id: c.receiver_id, method_name: c.method_name, args: JSON.stringify(c.args), deposit: c.deposit ?? BigInt(0), gas: BigInt(c.gas ?? 40) * TGAS }))),
          TGAS * BigInt(Math.min(200, calls.reduce((s, c) => s + (c.gas ?? 40), 0) + 20)),
          BigInt(0),
        ),
      ],
    });

  // 2. feed
  const before = (await care()).fullness;
  await exec([{ receiver_id: CONFIG.alley, method_name: "feed", args: { item: "fish" } }]);
  const fed = await care();
  check("feed: a fish is eaten and fills the kitten", (await itemOf("fish")) === 1 && fed.fullness > before, `${before} -> ${fed.fullness}`);

  // 3. buy a bow from Miso (signed quote) and wear it
  const q = await makeQuote({ tokenId: token, merchant: "miso", side: "buy", item: "bow", amount: 1 });
  if ("refused" in q) {
    check("wardrobe: Miso quotes a bow", false, q.refused);
  } else {
    await exec([
      {
        receiver_id: CONFIG.yarn,
        method_name: "ft_transfer_call",
        args: { receiver_id: CONFIG.alley, amount: q.quote.price_per, msg: JSON.stringify({ buy_merchant: { quote: q.quote, signature: q.signature } }) },
        deposit: BigInt(1),
        gas: 150,
      },
    ]);
    check("wardrobe: bought a bow from Miso", (await itemOf("bow")) === 1, `${q.price_per} YARN: "${q.reasoning}"`);
    await exec([{ receiver_id: CONFIG.alley, method_name: "dress", args: { outfit: ["bow"] } }]);
    check("wardrobe: the kitten wears it", (await care()).outfit.join() === "bow");
  }

  // 4. personality
  await exec([{ receiver_id: CONFIG.alley, method_name: "set_persona", args: { persona: "A tiny test pilot who narrates everything like a sports commentator." } }]);
  check("persona: written on chain", (await care()).persona.includes("sports commentator"));

  // 5. thoughts, paid with the kitten's own YARN
  const purse = await yarnOf();
  await exec([
    { receiver_id: CONFIG.yarn, method_name: "ft_transfer_call", args: { receiver_id: CONFIG.alley, amount: "3", msg: JSON.stringify({ think: {} }) }, deposit: BigInt(1), gas: 150 },
  ]);
  const paid = await care();
  check("thoughts: 3 YARN from the kitten's purse buys 3 thoughts", paid.thought_credits === 3 && (await yarnOf()) === purse - 3);

  // 6. talk (NEAR AI, verified, recorded on chain)
  const talk = await signed<{ ok: boolean; reply?: string; verified?: boolean; checks?: unknown; error?: string; chatId?: string }>("/api/cat/talk", {
    tokenId: token,
    message: "What did you do today?",
  });
  if (talk.body.ok) {
    console.log(`        ${token}: "${talk.body.reply}"`);
    check("talk: NEAR AI replied and every check passed", talk.body.verified === true, JSON.stringify(talk.body.checks));
    const after = await care();
    check("talk: the thought is recorded on chain and one credit spent", after.thoughts === 1 && after.thought_credits === 2);
    const t = await view<{ chat_id: string; signature: string }[]>(CONFIG.alley, "thoughts", { token_id: token });
    check("talk: on-chain record carries NEAR AI's chat id and signature", t[0]?.chat_id === talk.body.chatId && t[0]?.signature.length > 100);
  } else {
    check("talk: NEAR AI replied", false, talk.body.error);
  }

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll cat room checks passed.");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
