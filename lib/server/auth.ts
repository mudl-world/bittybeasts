// Server-only module (imports secrets from env). Never import from client components.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { KeyPair, PublicKey } from "near-api-js";
import { rpc } from "@/lib/chain/view";

// ---------------------------------------------------------------- email one-time codes
// Stateless: code = HMAC(secret, email | 10-minute window). Nothing to store.

const WINDOW_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Server is not configured: missing AUTH_SECRET");
  return s;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function codeFor(email: string, window = Math.floor(Date.now() / WINDOW_MS)): string {
  const h = createHmac("sha256", secret()).update(`${normalizeEmail(email)}|${window}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function checkCode(email: string, code: string): boolean {
  const now = Math.floor(Date.now() / WINDOW_MS);
  return [now, now - 1].some((w) => {
    const a = Buffer.from(codeFor(email, w));
    const b = Buffer.from(code.trim());
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/** Player account id for an email: a sub-account of ROOT, derived from a salted hash. */
export function playerAccountFor(email: string, root: string): string {
  const h = createHash("sha256").update(`${secret()}|${normalizeEmail(email)}`).digest("hex").slice(0, 16);
  return `p${h}.${root}`;
}

export async function sendCode(email: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Bitty Beasts <onboarding@resend.dev>",
      to: [email],
      subject: `${code} is your Bitty Beasts code`,
      text: `Your code is ${code}. It works for about 10 minutes.\n\nSmall enough for your keys. Fierce enough for nine lives.`,
    }),
  });
  return res.ok;
}

// ---------------------------------------------------------------- signed requests from players
// The browser signs `${path}|${accountId}|${ts}|${sha256(body)}` with the player's key. The server
// checks the signature and that the key is a full-access key of that account on chain.

export type SignedEnvelope = { accountId: string; publicKey: string; ts: number; signature: string; body: string };

export async function verifyPlayer(path: string, env: SignedEnvelope): Promise<{ accountId: string; body: unknown }> {
  if (Math.abs(Date.now() - env.ts) > 2 * 60 * 1000) throw new Error("Request expired");
  const digest = createHash("sha256").update(env.body).digest("hex");
  const message = new TextEncoder().encode(`${path}|${env.accountId}|${env.ts}|${digest}`);
  const pk = PublicKey.fromString(env.publicKey);
  const sig = Buffer.from(env.signature, "base64");
  if (!pk.verify(message, new Uint8Array(sig))) throw new Error("Bad signature");
  const key = await rpc().viewAccessKey({ accountId: env.accountId, publicKey: env.publicKey });
  const perm = (key as { permission?: unknown }).permission;
  if (perm !== "FullAccess") throw new Error("That key does not belong to this player");
  return { accountId: env.accountId, body: JSON.parse(env.body) };
}

export { KeyPair };
