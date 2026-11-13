import { PublicKey, actions, nearToYocto } from "near-api-js";
import { CONFIG } from "@/lib/chain/config";
import { rpc } from "@/lib/chain/view";
import { checkCode, playerAccountFor } from "@/lib/server/auth";
import { allow, clientIp, NEW_ACCOUNTS } from "@/lib/server/limits";
import { errorText, json, rootAccount } from "@/lib/server/near";

/** NEAR each new player account starts with: covers gas for a long time and a small adopt price. */
const PLAYER_FUNDS = "0.3";

// Step 2: check the code, then create the player's own account `p<hash>.ROOT` with the public key
// the browser generated. The private key never leaves the player's device; there is no seed phrase.
export async function POST(request: Request) {
  try {
    const { email, code, publicKey } = (await request.json()) as { email?: string; code?: string; publicKey?: string };
    if (!email || !code || !publicKey?.startsWith("ed25519:")) return json({ error: "Missing fields" }, 400);
    if (!checkCode(email, code)) return json({ error: "That code didn't match. Try again." }, 401);

    const accountId = playerAccountFor(email, CONFIG.root);
    const exists = await rpc()
      .viewAccount({ accountId })
      .then(() => true)
      .catch(() => false);

    if (exists) {
      const hasKey = await rpc()
        .viewAccessKey({ accountId, publicKey })
        .then(() => true)
        .catch(() => false);
      if (!hasKey) {
        return json(
          { error: "This email already plays on another device. Demo limit: one device per email (see README)." },
          409,
        );
      }
      return json({ accountId });
    }

    // Every new account costs the game 0.3 testnet NEAR: cap how fast anyone can mint them.
    const ip = clientIp(request);
    if (!allow(`acct:${ip}`, NEW_ACCOUNTS.perIp, NEW_ACCOUNTS.windowMs) || !allow("acct:all", NEW_ACCOUNTS.global, NEW_ACCOUNTS.windowMs)) {
      return json({ error: "Too many new players from here right now. Try again in an hour, or borrow a demo cat." }, 429);
    }

    await rootAccount().signAndSendTransaction({
      receiverId: accountId,
      actions: [
        actions.createAccount(),
        actions.transfer(nearToYocto(PLAYER_FUNDS)),
        actions.addFullAccessKey(PublicKey.fromString(publicKey)),
      ],
    });
    return json({ accountId });
  } catch (e) {
    return json({ error: errorText(e) }, 500);
  }
}
