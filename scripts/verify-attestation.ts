// Checks the NEAR AI TEE verification path on its own, without the game.
//
// Run this when a cat won't talk, after changing NEAR_AI_MODEL, or to see for yourself what is
// actually checked before a thought is allowed on chain:
//
//   ./node_modules/.bin/tsx scripts/verify-attestation.ts
//
// It runs the same code the game does (lib/server/nearai.ts) against the live NEAR AI Cloud API:
// fetches an attestation with a fresh nonce, parses the raw Intel TDX quotes, asks for one
// completion, then recovers the signer of the reply and matches it to the attested enclave.
// Needs NEAR_AI_API_KEY in .env.local. Exits non-zero if any check fails.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
for (const line of readFileSync(resolve(ROOT_DIR, ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  // Imported here, not at the top: the module reads NEAR_AI_* from the env loaded just above.
  const { attest, think, NEAR_AI_MODEL } = await import("../lib/server/nearai");

  console.log(`\nNEAR AI model: ${NEAR_AI_MODEL}\n`);

  // 1. Attestation on its own: a fresh nonce must come back bound inside the raw quotes.
  console.log("Attestation (fresh 32-byte nonce, raw Intel TDX quotes)");
  const a = await attest();
  for (const [who, q] of [["gateway", a.gateway] as const, ...a.models.map((m, i) => [`model[${i}]`, m] as const)]) {
    check(`${who}: our nonce is inside the quote's report_data`, q.nonceBound);
    check(`${who}: report_data also binds the signing address`, q.signerBound);
    check(`${who}: TD debug mode is off`, q.debugOff);
    check(`${who}: MRCONFIGID matches sha256(app_compose)`, q.configMeasured);
    if (q.gpuNonce !== null) check(`${who}: NVIDIA GPU evidence carries our nonce`, q.gpuNonce);
    console.log(`       signer ${q.signingAddress}`);
  }

  // 2. The whole path the game uses, including the completion and the response signature.
  console.log("\nOne real thought, verified end to end");
  const t = await think([{ role: "user", content: "Say one short sentence about a rooftop at night." }]);
  check("attestation passed", t.checks.attestation);
  check("signed text is exactly model:sha256(request):sha256(response)", t.checks.textMatches);
  check("signature recovers to the address that signed it", t.checks.signerRecovered);
  check("that address is the one inside the attested enclave", t.checks.signerAttested);
  console.log(`
  model          ${t.model}
  chat id        ${t.chatId}
  enclave signer ${t.signingAddress}
  sha256(req)    ${t.requestHash}
  sha256(reply)  ${t.responseHash}
  reply          ${JSON.stringify(t.reply.slice(0, 80))}`);

  console.log(
    failed === 0
      ? "\nAll checks passed. A thought like this is allowed on chain.\n"
      : `\n${failed} check(s) failed. The game would drop this reply and record nothing.\n`,
  );

  // What this deliberately does NOT do: full Intel DCAP signature-chain verification of the quote,
  // or NVIDIA NRAS. The raw quotes are kept on every thought so anyone can run dcap-qvl over them.
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
