import { CONFIG } from "@/lib/chain/config";
import { ITEMS, type Beast, type Item, type RunResult } from "@/lib/chain/types";
import { view } from "@/lib/chain/view";
import { verifyPlayer, type SignedEnvelope } from "@/lib/server/auth";
import { errorText, json, rootAccount } from "@/lib/server/near";

// The referee: checks a finished prowl is plausible for this Beast, then settles it on chain.
// The contract enforces the hard limits again (haul cap, no daring runs at zero lives).
const PATH = "/api/prowl/settle";

function plausible(run: RunResult, beast: Beast): string | null {
  if (!Number.isInteger(run.rooftops) || run.rooftops < 0 || run.rooftops > 60) return "Odd rooftop count";
  // A 30-second run cannot cross more than ~2 rooftops a second, even for a fast Beast.
  if (run.rooftops > 20 + beast.stats.speed * 2) return "Too many rooftops for 30 seconds";
  const total = run.haul.reduce((s, [, n]) => s + n, 0);
  if (total > 3 + run.rooftops * 3) return "Haul too big";
  for (const [item, n] of run.haul) {
    if (!ITEMS.includes(item as Item) || !Number.isInteger(n) || n < 0) return "Bad haul";
    if (item === "moonstone" && !run.daring) return "Moonstones only fall on daring runs";
  }
  if (run.binds < 0 || run.binds > 10) return "Too many binds";
  if (run.daring && beast.lives === 0) return "Resting: safe runs only";
  return null;
}

export async function POST(request: Request) {
  try {
    const envelope = (await request.json()) as SignedEnvelope;
    const { accountId, body } = await verifyPlayer(PATH, envelope);
    const { tokenId, run } = body as { tokenId: string; run: RunResult };
    const beast = await view<Beast | null>(CONFIG.alley, "beast", { token_id: tokenId });
    if (!beast) return json({ ok: false, error: "No such Beast" }, 404);
    if (beast.owner_id !== accountId) return json({ ok: false, error: "That Beast isn't yours" }, 403);
    const problem = plausible(run, beast);
    if (problem) return json({ ok: false, error: problem }, 400);

    const whips: Record<string, number> = {};
    for (const [m, n] of Object.entries(run.whips_on_awning ?? {})) {
      const account = CONFIG.merchants[m as keyof typeof CONFIG.merchants] ?? m;
      whips[account] = n;
    }
    const outcome = await rootAccount().callFunction({
      contractId: CONFIG.alley,
      methodName: "settle_run",
      args: {
        token_id: tokenId,
        daring: run.daring,
        rooftops: run.rooftops,
        haul: run.haul.filter(([, n]) => n > 0).map(([i, n]) => [i, String(n)]),
        fell: run.fell,
        mark: run.mark ?? null,
        whips_on_awning: whips,
        binds: run.binds,
      },
      gas: BigInt(150) * BigInt(1_000_000_000_000),
    });
    const after = await view<Beast | null>(CONFIG.alley, "beast", { token_id: tokenId });
    const txHash = (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? "";
    return json({ ok: true, txHash, lives: after?.lives, marks: after?.marks });
  } catch (e) {
    return json({ ok: false, error: errorText(e) }, 500);
  }
}
