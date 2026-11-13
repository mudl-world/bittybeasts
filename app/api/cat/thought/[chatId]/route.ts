import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { json } from "@/lib/server/near";

// The exact request/response bytes of one recorded thought, plus the attestation evidence, so anyone can
// recompute sha256(request) and sha256(response) and compare them with the hashes stored on chain.
export async function GET(_request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await ctx.params;
  try {
    const file = join(process.cwd(), ".data", "thoughts", `${chatId.replace(/[^\w.-]/g, "_")}.json`);
    return new Response(await readFile(file, "utf8"), { headers: { "content-type": "application/json" } });
  } catch {
    return json({ ok: false, error: "Not kept on this server. The on-chain hashes and NEAR AI's signature still verify." }, 404);
  }
}
