// Turns raw errors from the chain layer and API routes into short, friendly sentences.
// Game screens must never show stack traces or chain jargon, so anything technical is replaced.

export const NEEDS_KEY = "needs-key";

const JARGON = /(blockchain|wallet|\bnft\b|\bgas\b|transaction|receipt|rpc|yocto|ed25519|access key|signer|nonce|borsh|json|fetch failed|failed to fetch|networkerror|econn|status code|server error \(5)/i;

export function isMissingKey(message: string): boolean {
  return /no key for this beast|boop the keychain to bind/i.test(message);
}

export function friendly(err: unknown, fallback = "That didn't work. Try again in a moment."): string {
  let msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return fallback;
  if (isMissingKey(msg)) return "This phone doesn't know your Beast yet. Boop your keychain on this phone first.";
  if (/sign in first/i.test(msg)) return "Sign in first.";
  // Contract panics: keep only the human part.
  const panic = msg.match(/(?:panicked(?: at)?:?|ExecutionError:?|Smart contract panicked:?)\s*["']?([^"'\n]+)/i);
  if (panic?.[1]) msg = panic[1];
  msg = msg.split("\n")[0].replace(/^Error:\s*/i, "").trim();
  if (/not enough|insufficient|balance/i.test(msg)) return "Not enough YARN or items for that.";
  if (/expired/i.test(msg)) return "That price went stale. Ask again.";
  if (/once per (day|night)|already booped/i.test(msg)) return "Already booped today. Come back tomorrow night.";
  if (/(does not exist|doesn't exist|unknown account|not found)/i.test(msg)) return "The alley isn't open yet. Try again soon.";
  if (/frozen|wander/i.test(msg)) return "This Beast is wandering right now, so it can't do that.";
  if (/too many requests|429/i.test(msg)) return "The alley is busy. Try again in a few seconds.";
  if (JARGON.test(msg) || msg.length > 160) return fallback;
  return msg;
}

/** For view calls: a failed read means the alley can't be reached (not deployed, offline, etc). */
export const QUIET = "The alley is quiet right now. We couldn't reach the night market. Try again in a moment.";
