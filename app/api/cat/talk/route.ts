import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG } from "@/lib/chain/config";
import { verifyPlayer, type SignedEnvelope } from "@/lib/server/auth";
import { buildMessages, catContext, clipBytes } from "@/lib/server/cat";
import { errorText, json, rootAccount } from "@/lib/server/near";
import { think } from "@/lib/server/nearai";

// The owner talks to their cat:
//   1. check the player signed this and owns the Beast, and the Beast has a thought credit (paid in its own YARN)
//   2. build the prompt from on-chain data only
//   3. NEAR AI: fresh attestation, completion, signature, all verified (lib/server/nearai.ts)
//   4. the referee records the thought on chain (hashes + NEAR AI's signature), spending one credit
// Unverified replies are not recorded and cost nothing.
const PATH = "/api/cat/talk";
const THOUGHTS_DIR = join(process.cwd(), ".data", "thoughts");

export async function POST(request: Request) {
  try {
    const envelope = (await request.json()) as SignedEnvelope;
    const { accountId, body } = await verifyPlayer(PATH, envelope);
    const { tokenId, message } = body as { tokenId: string; message: string };
    const said = clipBytes(String(message ?? "").trim(), 280);
    if (!said) return json({ ok: false, error: "Say something to your cat" }, 400);

    const ctx = await catContext(tokenId);
    if (ctx.beast.owner_id !== accountId) return json({ ok: false, error: "That Beast isn't yours" }, 403);
    if (!ctx.beast.woken || ctx.beast.wander) return json({ ok: false, error: "Your cat isn't home right now" }, 409);
    if (ctx.care.thought_credits < 1)
      return json({ ok: false, error: "Your cat is out of thoughts. Buy some with its YARN.", needsThoughts: true }, 402);

    const t = await think(buildMessages(ctx, said));
    if (!t.verified) {
      return json({ ok: false, error: "NEAR AI's reply could not be verified, so it was not recorded (no YARN spent).", checks: t.checks }, 502);
    }
    const reply = clipBytes(t.reply, 780);

    const out = await rootAccount().callFunction({
      contractId: CONFIG.alley,
      methodName: "record_thought",
      args: {
        token_id: tokenId,
        said,
        reply,
        model: t.model,
        chat_id: t.chatId,
        request_hash: t.requestHash,
        response_hash: t.responseHash,
        signature: t.signature,
        signing_address: t.signingAddress,
        signing_algo: t.signingAlgo,
      },
      gas: BigInt(50) * BigInt(10) ** BigInt(12),
    });

    // Keep the exact bytes so anyone can recompute the hashes (GET /api/cat/thought/<chatId>).
    try {
      await mkdir(THOUGHTS_DIR, { recursive: true });
      await writeFile(
        join(THOUGHTS_DIR, `${t.chatId.replace(/[^\w.-]/g, "_")}.json`),
        JSON.stringify({ tokenId, chatId: t.chatId, model: t.model, signatureKind: t.signatureKind, checks: t.checks, attestation: t.attestation, raw: t.raw }),
      );
    } catch {
      // Best effort: the on-chain record and NEAR AI's signature endpoint remain the source of truth.
    }

    return json({
      ok: true,
      reply,
      verified: t.verified,
      checks: t.checks,
      model: t.model,
      chatId: t.chatId,
      signingAddress: t.signingAddress,
      requestHash: t.requestHash,
      responseHash: t.responseHash,
      creditsLeft: ctx.care.thought_credits - 1,
      txHash: (out as { transaction?: { hash?: string } })?.transaction?.hash,
    });
  } catch (e) {
    return json({ ok: false, error: errorText(e) }, 500);
  }
}
