// Server-only module (imports secrets from env). Never import from client components.
import { createHash, createPublicKey, createVerify } from "node:crypto";
import { KeyPair, PublicKey } from "near-api-js";
import { rpc } from "@/lib/chain/view";

// ---------------------------------------------------------------- identity
// Sign-in is Google only: Google asserts the email, and the account id is derived from it below.

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Server is not configured: missing AUTH_SECRET");
  return s;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Player account id for an email: a sub-account of ROOT, derived from a salted hash. */
export function playerAccountFor(email: string, root: string): string {
  const h = createHash("sha256").update(`${secret()}|${normalizeEmail(email)}`).digest("hex").slice(0, 16);
  return `p${h}.${root}`;
}

// ---------------------------------------------------------------- Google sign-in
// The browser gets an ID token from Google Identity Services; we verify it here rather than
// trusting anything the client says. Verification is the standard set of checks: RS256 signature
// against Google's published keys, issuer, audience (our client id), expiry, and email_verified.
// Google asserts the address, so no email has to be delivered for sign-in to be secure.

const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

type Jwk = { kid: string; n: string; e: string; alg?: string; kty: string };
let jwksCache: { keys: Jwk[]; at: number } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  // Google rotates these; an hour is well inside their cache headers.
  if (jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS);
  if (!res.ok) throw new Error("Could not reach Google to check that sign-in");
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys, at: Date.now() };
  return keys;
}

const b64urlToBuf = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Verifies a Google ID token and returns the verified email. Throws if anything fails. */
export async function verifyGoogleToken(idToken: string): Promise<{ email: string }> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google sign-in is not configured on this server");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed Google token");
  const [rawHeader, rawPayload, rawSig] = parts;

  // Anything unparseable is just a bad token: say so, rather than leaking a parser error.
  const decode = (part: string, what: string) => {
    try {
      return JSON.parse(b64urlToBuf(part).toString()) as Record<string, unknown>;
    } catch {
      throw new Error(`Malformed Google token (${what})`);
    }
  };

  const header = decode(rawHeader, "header") as { kid?: string; alg?: string };
  if (header.alg !== "RS256") throw new Error("Unexpected Google token algorithm");

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown Google signing key");

  const key = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" });
  const ok = createVerify("RSA-SHA256")
    .update(`${rawHeader}.${rawPayload}`)
    .verify(key, new Uint8Array(b64urlToBuf(rawSig)));
  if (!ok) throw new Error("That Google sign-in could not be verified");

  const claims = decode(rawPayload, "claims") as {
    iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean | string;
  };
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) throw new Error("That token did not come from Google");
  if (claims.aud !== clientId) throw new Error("That Google sign-in was issued for another app");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("That Google sign-in expired. Try again.");
  // Google sends this as a boolean or the string "true" depending on the flow.
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("That Google account has no verified email");
  if (!claims.email) throw new Error("That Google account did not share an email");

  return { email: normalizeEmail(claims.email) };
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
