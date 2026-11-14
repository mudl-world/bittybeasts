// Turning a proven email into a playable account. Once the server is satisfied the person owns the
// address, derive their account id from it and create the account with the public key the browser
// generated.
//
// Multiple devices: each browser generates its own key, so signing in somewhere new brings a key
// the account has never seen. To let the same person play on a second device, the server keeps a
// recovery key of its own on every account it creates (`rootAccount`'s public key) and uses it to
// add the new browser's key on sign-in. The trade-off is explicit: the game server *can* act as a
// player. It is the price of "no seed phrase, no wallet" — without it, closing an incognito window
// or clearing site data strands the account forever, because NEAR does not let a parent account
// add keys to an existing subaccount.
import { Account, KeyPair, PublicKey, actions, nearToYocto, type KeyPairString } from "near-api-js";
import { CONFIG } from "@/lib/chain/config";
import { rpc } from "@/lib/chain/view";
import { playerAccountFor } from "@/lib/server/auth";
import { allow, clientIp, NEW_ACCOUNTS } from "@/lib/server/limits";
import { json, rootAccount } from "@/lib/server/near";

/** NEAR each new player account starts with: covers gas for a long time and a small adopt price. */
const PLAYER_FUNDS = "0.3";

/** How many devices one account may be signed in on at once (recovery key not counted). */
const MAX_DEVICE_KEYS = 5;

/** The server's own key, kept on each player account so a new device can be added later. */
function recoveryKeyPair(): KeyPair {
  const k = process.env.NEAR_ROOT_KEY;
  if (!k) throw new Error("Server is not configured: missing NEAR_ROOT_KEY.");
  return KeyPair.fromString(k as KeyPairString);
}

/** The player's account, signing with the server's recovery key. */
function playerAccountAsServer(accountId: string): Account {
  return new Account(accountId, rpc(), process.env.NEAR_ROOT_KEY as KeyPairString);
}

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
    if (hasKey) return json({ accountId });

    // A device the account has not seen. If the server still holds its recovery key, add this
    // browser's key and let them in; otherwise the account predates recovery keys (or someone
    // removed it) and only an existing device can authorise a new one.
    const recovery = recoveryKeyPair().getPublicKey().toString();
    const canRecover = await rpc()
      .viewAccessKey({ accountId, publicKey: recovery })
      .then(() => true)
      .catch(() => false);
    if (!canRecover) {
      return json(
        {
          error:
            "This account was created on a device whose key is gone, and it has no server recovery key, " +
            "so it can't be reopened. Sign in with a different address (you+anything@gmail.com works), " +
            "or borrow a demo cat.",
        },
        409,
      );
    }

    const keyCount = await rpc()
      .viewAccessKeyList({ accountId })
      .then((r) => r.keys.length)
      .catch(() => 0);
    if (keyCount > MAX_DEVICE_KEYS) {
      return json({ error: `This account is already signed in on ${MAX_DEVICE_KEYS} devices.` }, 409);
    }

    // Rate-limited like account creation: adding a key costs the game gas.
    const ipForKey = clientIp(request);
    if (!allow(`key:${ipForKey}`, NEW_ACCOUNTS.perIp, NEW_ACCOUNTS.windowMs)) {
      return json({ error: "Too many new devices from here right now. Try again in an hour." }, 429);
    }

    await playerAccountAsServer(accountId).signAndSendTransaction({
      receiverId: accountId,
      actions: [actions.addFullAccessKey(PublicKey.fromString(publicKey))],
    });
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
      // The recovery key, so this player can sign in on a second device later.
      actions.addFullAccessKey(recoveryKeyPair().getPublicKey()),
    ],
  });
  return json({ accountId });
}
