"use client";
// Signed actions. Keys live in the browser (lib/chain/keys.ts); nothing here opens a wallet popup.
//  - Player-account calls are signed with the player's key (account funded at sign-up, so no gas prompt).
//  - Beast actions are signed with the Beast's controller key, a function-call key on the Beast's own
//    account that can only call `execute` on its beast-wallet contract. Gas comes from the Beast's account.
import { Account, KeyPair, type KeyPairString, actions, nearToYocto } from "near-api-js";
import { encodeCalls, type WalletCall } from "./borsh";
import { CONFIG } from "./config";
import { keys, newKeyPair } from "./keys";
import { rpc } from "./view";
import type { Item, Quote, RunResult, StallRules } from "./types";

export type TxResult = { ok: true; txHash: string; value?: unknown } | { ok: false; error: string };

type Call = WalletCall;

const TGAS = BigInt(1_000_000_000_000);
const tgas = (n: number) => BigInt(n) * TGAS;

const ONE_YOCTO = "1";

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function run(fn: () => Promise<{ transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | unknown>): Promise<TxResult> {
  try {
    const out = (await fn()) as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | undefined;
    const txHash = out?.transaction?.hash ?? out?.transaction_outcome?.id ?? "";
    return { ok: true, txHash, value: out };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${url} failed (${res.status})`);
  return data;
}

// ---------- session ----------

export function session(): { accountId: string; email?: string } | null {
  const s = keys.player();
  return s ? { accountId: s.accountId, email: s.email } : null;
}

/** Signs in with a Google ID token. The server verifies it and returns the same player account
    the email code flow would give that address, so either way in reaches the same cat. */
export async function signInWithGoogle(idToken: string, email?: string): Promise<{ accountId: string }> {
  const kp = newKeyPair();
  const { accountId } = await postJson<{ accountId: string }>("/api/auth/google", { idToken, publicKey: kp.publicKey });
  keys.setPlayer({ accountId, email, secretKey: kp.secretKey });
  return { accountId };
}

export type DemoAccount = {
  accountId: string;
  secretKey: string;
  beast: { tokenId: string; name: string; controllerKey: string; keychainSecret: string } | null;
};

/** Testnet demo players published in /demo-accounts.json (keys are public on purpose). */
export async function listDemoAccounts(): Promise<DemoAccount[]> {
  const res = await fetch("/demo-accounts.json", { cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()) as { accounts: DemoAccount[] }).accounts;
}

/** Signs this device in as a demo player, with its Beast's controller key. */
export function signInAsDemo(demo: DemoAccount) {
  keys.setPlayer({ accountId: demo.accountId, secretKey: demo.secretKey as KeyPairString });
  if (demo.beast) {
    keys.setBeast(demo.beast.tokenId, demo.beast.controllerKey as KeyPairString);
    keys.setKittenSecret(demo.beast.tokenId, demo.beast.keychainSecret);
  }
}

/** The daily cuddle: lights one link back up and tugs the Great Yarn. Needs the cat's claim secret on this device. */
export async function cuddle(tokenId: string): Promise<TxResult> {
  const secret = keys.kittenSecret(tokenId);
  if (!secret) return { ok: false, error: "This device doesn't have your cat's collar tag. Cuddle it from the device you adopted it on." };
  return boop(tokenId, secret);
}

/** True if this device holds the key that currently controls the Beast. */
export function hasBeastKey(tokenId: string, controller: string | null): boolean {
  const secret = keys.beast(tokenId);
  if (!secret || !controller) return false;
  return KeyPair.fromString(secret).getPublicKey().toString() === controller;
}

export function signOut() {
  keys.clearPlayer();
}

function playerAccount(): Account {
  const s = keys.player();
  if (!s) throw new Error("Sign in first");
  return new Account(s.accountId, rpc(), s.secretKey);
}

function playerCall(contractId: string, methodName: string, args: Record<string, unknown>, deposit = "0", gasTera = 100) {
  return run(() =>
    playerAccount().callFunction({ contractId, methodName, args, deposit: BigInt(deposit), gas: tgas(gasTera) }),
  );
}

// ---------- Beast wallet ----------

function beastAccount(tokenId: string): Account {
  const secret = keys.beast(tokenId);
  if (!secret) throw new Error("This device has no key for this Beast. Boop the keychain to bind one.");
  return new Account(CONFIG.beastAccount(tokenId), rpc(), secret);
}

/** Runs calls from the Beast's own account through its beast-wallet `execute`. */
function beastExec(tokenId: string, calls: Call[]) {
  return run(() =>
    beastAccount(tokenId).signAndSendTransaction({
      receiverId: CONFIG.beastAccount(tokenId),
      // Outer gas sized to the inner calls (max 200 TGas): the protocol checks the Beast's balance and
      // key allowance against a pessimistic gas price, so 300 TGas would need ~0.3 NEAR reserved.
      actions: [
        actions.functionCall(
          "execute",
          encodeCalls(calls),
          tgas(Math.min(200, calls.reduce((s, c) => s + Number(c.gas / TGAS), 0) + 20)),
          BigInt(0),
        ),
      ],
    }),
  );
}

const call = (receiver_id: string, method_name: string, args: unknown, deposit = "0", gasTera = 40): Call => ({
  receiver_id,
  method_name,
  args: JSON.stringify(args),
  deposit: BigInt(deposit),
  gas: tgas(gasTera),
});

function yarnPay(amount: number, msg: unknown): Call {
  return call(CONFIG.yarn, "ft_transfer_call", { receiver_id: CONFIG.alley, amount: String(amount), msg: JSON.stringify(msg) }, ONE_YOCTO, 150);
}

// ---------- keychain + lives ----------

/** First scan of the QR card: claims the Beast and binds a controller key on this device. */
export async function wakeBeast(tokenId: string, secret: string): Promise<TxResult> {
  const kp = newKeyPair();
  const res = await playerCall(CONFIG.alley, "wake", { token_id: tokenId, secret, controller_pk: kp.publicKey }, "0", 150);
  if (res.ok) keys.setBeast(tokenId, kp.secretKey);
  return res;
}

/** Rebind this device as the Beast's controller (new phone, or after nft_transfer). */
export async function bindKey(tokenId: string): Promise<TxResult> {
  const kp = newKeyPair();
  const res = await playerCall(CONFIG.alley, "bind_key", { token_id: tokenId, controller_pk: kp.publicKey }, "0", 150);
  if (res.ok) keys.setBeast(tokenId, kp.secretKey);
  return res;
}

export const boop = (tokenId: string, secret: string) =>
  playerCall(CONFIG.alley, "boop", { token_id: tokenId, secret }, "0", 150);

/** POSTs a body signed with the player's key; the server checks it against the account's keys on chain. */
async function signedPost<T>(path: string, payload: unknown): Promise<T> {
  const s = keys.player();
  if (!s) throw new Error("Sign in first");
  const body = JSON.stringify(payload);
  const ts = Date.now();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const kp = KeyPair.fromString(s.secretKey);
  const { signature } = kp.sign(new TextEncoder().encode(`${path}|${s.accountId}|${ts}|${digest}`));
  let bin = "";
  signature.forEach((b) => (bin += String.fromCharCode(b)));
  return postJson<T>(path, { accountId: s.accountId, publicKey: kp.getPublicKey().toString(), ts, signature: btoa(bin), body });
}

export async function settleRun(
  tokenId: string,
  result: RunResult,
): Promise<TxResult & { lives?: number; marks?: { kind: string; note: string; at_ms: number }[] }> {
  try {
    return await signedPost("/api/prowl/settle", { tokenId, run: result });
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// ---------- market ----------

type QuoteResponse = { quote: Quote; signature: string; price_per: number; reasoning: string };

export async function getQuote(tokenId: string, merchant: string, side: "sell" | "buy", item: Item, amount: number) {
  return postJson<QuoteResponse>("/api/merchant/quote", { tokenId, merchant, side, item, amount });
}

export async function sellToMerchant(tokenId: string, merchant: string, item: Item, amount: number, q?: QuoteResponse) {
  try {
    const quote = q ?? (await getQuote(tokenId, merchant, "sell", item, amount));
    const res = await beastExec(tokenId, [
      call(CONFIG.alley, "sell_to_merchant", { quote: quote.quote, signature: quote.signature }, "0", 80),
    ]);
    return { ...res, reasoning: quote.reasoning, price_per: quote.price_per };
  } catch (e) {
    return { ok: false as const, error: errorText(e) };
  }
}

export async function buyFromMerchant(tokenId: string, merchant: string, item: Item, amount: number, q?: QuoteResponse) {
  try {
    const quote = q ?? (await getQuote(tokenId, merchant, "buy", item, amount));
    const total = quote.price_per * amount;
    const res = await beastExec(tokenId, [yarnPay(total, { buy_merchant: { quote: quote.quote, signature: quote.signature } })]);
    return { ...res, reasoning: quote.reasoning, price_per: quote.price_per };
  } catch (e) {
    return { ok: false as const, error: errorText(e) };
  }
}

export const openStall = (tokenId: string, slot: number) => beastExec(tokenId, [call(CONFIG.alley, "open_stall", { slot })]);
export const closeStall = (tokenId: string) => beastExec(tokenId, [call(CONFIG.alley, "close_stall", {})]);
export const setStallRules = (tokenId: string, rules: StallRules) =>
  beastExec(tokenId, [call(CONFIG.alley, "set_stall_rules", { rules })]);
export const payRent = (tokenId: string, amount: number) => beastExec(tokenId, [yarnPay(amount, { rent: {} })]);
export const buyFromStall = (tokenId: string, slot: number, item: Item, amount: number, pricePer: number) =>
  beastExec(tokenId, [yarnPay(amount * pricePer, { buy_stall: { slot, item, amount: String(amount), price_per: String(pricePer) } })]);
export const revive = (tokenId: string, target: string, amount: number) =>
  beastExec(tokenId, [yarnPay(amount, { revive: { target } })]);

// ---------- the cat room ----------

export const feedBeast = (tokenId: string, item: "fish" | "catnip") => beastExec(tokenId, [call(CONFIG.alley, "feed", { item })]);
export const dressBeast = (tokenId: string, outfit: string[]) => beastExec(tokenId, [call(CONFIG.alley, "dress", { outfit })]);
export const setPersona = (tokenId: string, persona: string) => beastExec(tokenId, [call(CONFIG.alley, "set_persona", { persona })]);
/** The Beast pays its own YARN for thoughts (1 YARN each); the YARN goes to the $YARN treasury. */
export const buyThoughts = (tokenId: string, count: number) => beastExec(tokenId, [yarnPay(count, { think: {} })]);

export type TalkResult =
  | {
      ok: true;
      reply: string;
      verified: boolean;
      checks: { attestation: boolean; textMatches: boolean; signerRecovered: boolean; signerAttested: boolean };
      model: string;
      chatId: string;
      signingAddress: string;
      requestHash: string;
      responseHash: string;
      creditsLeft: number;
      txHash?: string;
    }
  | { ok: false; error: string; needsThoughts?: boolean };

/** Say something to the cat. The server builds the prompt from on-chain data, asks NEAR AI, verifies, records. */
export async function talkToCat(tokenId: string, message: string): Promise<TalkResult> {
  try {
    return await signedPost<TalkResult>("/api/cat/talk", { tokenId, message });
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** A free kitten for a new player: the studio registers it, then this device wakes it with a fresh key. */
export async function adoptKitten(name: string): Promise<TxResult & { tokenId?: string }> {
  try {
    const r = await signedPost<{ ok: boolean; tokenId?: string; secret?: string; error?: string }>("/api/cat/adopt", { name });
    if (!r.ok || !r.tokenId || !r.secret) return { ok: false, error: r.error ?? "No kitten today" };
    keys.setKittenSecret(r.tokenId, r.secret);
    const woke = await wakeBeast(r.tokenId, r.secret);
    return { ...woke, tokenId: r.tokenId };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

// ---------- resale: wander then adopt ----------

export const wander = (tokenId: string, priceNear: string) =>
  playerCall(CONFIG.alley, "wander", { token_id: tokenId, price: nearToYocto(priceNear as `${number}`).toString() }, ONE_YOCTO, 150);
export const cancelWander = (tokenId: string) =>
  playerCall(CONFIG.alley, "cancel_wander", { token_id: tokenId }, ONE_YOCTO, 150);

/** Buyer scans the keychain and adopts. Pays the asking price; royalty goes to the maker. */
export async function adopt(tokenId: string, secret: string, priceYocto: string): Promise<TxResult> {
  const kp = newKeyPair();
  const res = await playerCall(CONFIG.alley, "adopt", { token_id: tokenId, secret, controller_pk: kp.publicKey }, priceYocto, 250);
  if (res.ok) keys.setBeast(tokenId, kp.secretKey);
  return res;
}

// ---------- anyone can close the night ----------

export const closeNight = () => playerCall(CONFIG.alley, "close_night", {}, "0", 300);
export const settleYarn = () => playerCall(CONFIG.yarn, "settle", {}, "0", 300);

export { KeyPair, type KeyPairString };
