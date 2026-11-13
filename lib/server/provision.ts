// Turning a proven email into a playable account. Shared by both ways in (email code, Google):
// once the server is satisfied the person owns the address, the rest is identical — derive their
// account id from it, and create the account with the public key the browser generated.
import { PublicKey, actions, nearToYocto } from "near-api-js";
import { CONFIG } from "@/lib/chain/config";
import { rpc } from "@/lib/chain/view";
import { playerAccountFor } from "@/lib/server/auth";
import { allow, clientIp, NEW_ACCOUNTS } from "@/lib/server/limits";
import { json, rootAccount } from "@/lib/server/near";

/** NEAR each new player account starts with: covers gas for a long time and a small adopt price. */
const PLAYER_FUNDS = "0.3";

/** Creates (or re-uses) the player account for a verified email. Returns a Response either way. */
export async function provisionPlayer(request: Request, email: string, publicKey: string): Promise<Response> {
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
}
