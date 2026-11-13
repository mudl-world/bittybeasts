// Server-only. Simple sliding-window rate limits for actions that spend the game's NEAR.
// In memory, per server instance: enough to stop a single script from draining the faucet-funded
// root account in the demo; a production deployment would back this with a shared store.

const hits = new Map<string, number[]>();

/** True if `key` may act again: at most `max` times in the last `windowMs`. Records the hit when allowed. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

/** Best-effort client address from the proxy headers. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

const HOUR = 60 * 60 * 1000;
/** New funded accounts (players and kittens) per address, and for the whole server, per hour. */
export const NEW_ACCOUNTS = { perIp: 3, global: 40, windowMs: HOUR };
