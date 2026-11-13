// Server-only module (imports secrets from env). Never import from client components.
// Server-side NEAR accounts. Keys come only from env (.env.local, never committed).
import { Account, KeyPair, type KeyPairString } from "near-api-js";
import { CONFIG } from "@/lib/chain/config";
import { rpc } from "@/lib/chain/view";
import type { MerchantId } from "@/lib/economy/pricing";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Server is not configured: missing ${name}. Run scripts/deploy.ts first.`);
  return v;
}

/** ROOT: referee for prowls and funder of new player accounts. */
export function rootAccount(): Account {
  return new Account(CONFIG.root, rpc(), env("NEAR_ROOT_KEY") as KeyPairString);
}

const MERCHANT_ENV: Record<MerchantId, string> = {
  tom: "MERCHANT_TOM_KEY",
  miso: "MERCHANT_MISO_KEY",
  bandit: "MERCHANT_BANDIT_KEY",
  clove: "MERCHANT_CLOVE_KEY",
};

export function merchantKey(id: MerchantId): KeyPair {
  return KeyPair.fromString(env(MERCHANT_ENV[id]) as KeyPairString);
}

export function merchantAccount(id: MerchantId): Account {
  return new Account(CONFIG.merchants[id], rpc(), env(MERCHANT_ENV[id]) as KeyPairString);
}

export function merchantIdFor(account: string): MerchantId | null {
  const hit = (Object.entries(CONFIG.merchants) as [MerchantId, string][]).find(([, a]) => a === account);
  return hit ? hit[0] : null;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Contract panics arrive as "Smart contract panicked: <reason>"; keep the reason only.
  const m = msg.match(/panicked: (.*?)(?:"|$)/);
  return m ? m[1] : msg;
}
