import { createHash, randomBytes } from "node:crypto";
import { Account, type KeyPairString, nearToYocto } from "near-api-js";
import { CONFIG } from "@/lib/chain/config";
import type { Beast } from "@/lib/chain/types";
import { rpc, view } from "@/lib/chain/view";
import { verifyPlayer, type SignedEnvelope } from "@/lib/server/auth";
import { allow, clientIp, NEW_ACCOUNTS } from "@/lib/server/limits";
import { errorText, json, merchantAccount, rootAccount } from "@/lib/server/near";

// A free kitten for a new player. The studio registers a fresh Beast (its own NEAR account, nine lives,
// random stats) with a one-time claim secret, and hands the secret to this player only; the player's
// browser then calls `wake` itself, so the NFT and the controller key are the player's from the start.
const PATH = "/api/cat/adopt";
const TGAS = BigInt(10) ** BigInt(12);
const NAMES = ["Mochi", "Biscuit", "Noodle", "Pip", "Saffron", "Tofu", "Juniper", "Pebble", "Wasabi", "Nutmeg", "Ziggy", "Marmalade", "Kipper", "Bramble", "Luna", "Pickle", "Dumpling", "Sprout", "Velvet", "Ember"];

function studio(): Account {
  const key = process.env.KEY_STUDIO;
  if (!key) throw new Error("Server is not configured: missing KEY_STUDIO");
  return new Account(CONFIG.studio, rpc(), key as KeyPairString);
}

const stat = () => 3 + Math.floor(Math.random() * 6); // 3..8
const WELCOME_YARN = 15;
const WELCOME_FISH = 2;

export async function POST(request: Request) {
  try {
    const envelope = (await request.json()) as SignedEnvelope;
    const { accountId, body } = await verifyPlayer(PATH, envelope);
    if (!allow(`kitten:${clientIp(request)}`, NEW_ACCOUNTS.perIp, NEW_ACCOUNTS.windowMs) || !allow("kitten:all", NEW_ACCOUNTS.global, NEW_ACCOUNTS.windowMs)) {
      return json({ ok: false, error: "Too many kittens adopted from here right now. Try again in an hour." }, 429);
    }
    const owned = await view<Beast[]>(CONFIG.alley, "beasts_for_owner", { account_id: accountId });
    if (owned.length > 0) return json({ ok: false, error: "You already have a cat" }, 409);

    const asked = String((body as { name?: string }).name ?? "").replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 20);
    const name = asked || NAMES[Math.floor(Math.random() * NAMES.length)];
    // Unique per attempt: if a wake ever fails, the next attempt gets a fresh kitten instead of a stuck one.
    const tokenId = `kit-${createHash("sha256").update(accountId).digest("hex").slice(0, 8)}-${randomBytes(3).toString("hex")}`;
    const secret = randomBytes(16).toString("hex");

    // Keep the studio able to pay for kittens (0.3 NEAR each: the Beast's own account and storage).
    const st = studio();
    const bal = BigInt((await rpc().viewAccount({ accountId: CONFIG.studio })).amount);
    if (bal < nearToYocto("1")) {
      await rootAccount().transfer({ receiverId: CONFIG.studio, amount: nearToYocto("2") });
    }

    await st.callFunction({
      contractId: CONFIG.alley,
      methodName: "register_beast",
      args: {
        token_id: tokenId,
        name,
        media: "/art/cat-neutral.svg",
        stats: { reach: stat(), grip: stat(), speed: stat(), luck: stat() },
        claim_hash: createHash("sha256").update(secret).digest("hex"),
      },
      deposit: nearToYocto("0.3"),
      gas: TGAS * BigInt(150),
    });
    // A welcome from the Lane, each signed by the merchant agent's own key (best effort):
    // Sister Clove leaves a small purse of YARN, Old Tom grudgingly leaves two fish.
    const kitten = CONFIG.beastAccount(tokenId);
    const gifts = await Promise.allSettled([
      merchantAccount("clove").callFunction({
        contractId: CONFIG.yarn,
        methodName: "ft_transfer",
        args: { receiver_id: kitten, amount: String(WELCOME_YARN), memo: "Sister Clove's welcome purse" },
        deposit: BigInt(1),
        gas: TGAS * BigInt(30),
      }),
      merchantAccount("tom").callFunction({
        contractId: CONFIG.alley,
        methodName: "mt_transfer",
        args: { receiver_id: kitten, token_id: "fish", amount: String(WELCOME_FISH), memo: "Old Tom: don't get used to it" },
        deposit: BigInt(1),
        gas: TGAS * BigInt(30),
      }),
    ]);
    return json({ ok: true, tokenId, secret, name, gifts: gifts.map((g) => g.status) });
  } catch (e) {
    return json({ ok: false, error: errorText(e) }, 500);
  }
}
