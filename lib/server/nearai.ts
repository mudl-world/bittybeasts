// Server-only. NEAR AI Cloud: private inference in TEEs, with verification on every thought.
//
// For each thought the cat has:
//   1. Attestation, before the completion. We send a fresh 32-byte nonce to /v1/attestation/report and
//      check, inside the raw Intel TDX quotes (not the HTTP echo): report_data = signing address ||
//      zero padding || our nonce, TD debug mode is off, MRCONFIGID = 01 || sha256(app_compose) || 0x00*15,
//      and the NVIDIA GPU evidence carries our nonce. (Full DCAP signature-chain verification of the quote
//      and NVIDIA NRAS are not run here; the quotes are kept so anyone can run dcap-qvl on them.)
//   2. The completion, keeping the exact request and response bytes.
//   3. The response signature from /v1/signature/{chat_id}: we rebuild the signed text from our own
//      sha256 hashes of those bytes, recover the EIP-191 signer, and require it to equal the signing
//      address we just attested (the model's TEE for provider_tee, the gateway for gateway signatures).
import { createHash, randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const BASE = "https://cloud-api.near.ai/v1";
export const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL ?? "Qwen/Qwen3-VL-30B-A3B-Instruct";
const ALGO = "ecdsa";

function apiKey(): string {
  const k = process.env.NEAR_AI_API_KEY;
  if (!k) throw new Error("The cat can't think yet: NEAR_AI_API_KEY is not set on the server.");
  return k;
}

const sha256hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const hexToBytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const bytesToHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// ---------------------------------------------------------------- attestation

export type QuoteCheck = {
  signingAddress: string;
  nonceBound: boolean;
  signerBound: boolean;
  debugOff: boolean;
  configMeasured: boolean;
  gpuNonce: boolean | null;
};

export type Attestation = {
  nonce: string;
  model: string;
  gateway: QuoteCheck;
  models: QuoteCheck[];
  /** Raw TDX quotes, kept for independent DCAP verification. */
  quotes: { gateway: string; models: string[] };
};

type Report = {
  signing_address: string;
  signing_algo: string;
  intel_quote: string;
  request_nonce?: string;
  nvidia_payload?: string;
  info?: { tcb_info?: { app_compose?: string } | string };
};

/** Checks one TDX v4 quote's report data, debug bit and config measurement against our nonce. */
export function checkQuote(r: Report, nonce: string): QuoteCheck {
  const q = hexToBytes(r.intel_quote);
  const body = 48; // TD quote body starts after the 48-byte header
  const reportData = q.slice(body + 520, body + 584);
  const tdAttributes = q.slice(body + 120, body + 128);
  const mrConfigId = q.slice(body + 184, body + 232);
  const addr = hexToBytes(r.signing_address);
  const signerBound =
    addr.length === 20 && bytesToHex(reportData.slice(0, 20)) === bytesToHex(addr) && reportData.slice(20, 32).every((b) => b === 0);
  const nonceBound = bytesToHex(reportData.slice(32, 64)) === nonce && (r.request_nonce ?? nonce) === nonce;
  const debugOff = (tdAttributes[0] & 1) === 0;
  let configMeasured = false;
  const tcb = typeof r.info?.tcb_info === "string" ? (JSON.parse(r.info.tcb_info) as { app_compose?: string }) : r.info?.tcb_info;
  if (tcb?.app_compose) {
    const expected = new Uint8Array(48);
    expected[0] = 0x01;
    expected.set(hexToBytes(sha256hex(tcb.app_compose)), 1);
    configMeasured = bytesToHex(mrConfigId) === bytesToHex(expected);
  }
  let gpuNonce: boolean | null = null;
  if (r.nvidia_payload) {
    try {
      gpuNonce = (JSON.parse(r.nvidia_payload) as { nonce?: string }).nonce === nonce;
    } catch {
      gpuNonce = false;
    }
  }
  return { signingAddress: r.signing_address.toLowerCase(), nonceBound, signerBound, debugOff, configMeasured, gpuNonce };
}

const passed = (c: QuoteCheck) => c.nonceBound && c.signerBound && c.debugOff && c.configMeasured && c.gpuNonce !== false;

export async function attest(model = NEAR_AI_MODEL): Promise<Attestation> {
  const nonce = randomBytes(32).toString("hex");
  const url = `${BASE}/attestation/report?${new URLSearchParams({ signing_algo: ALGO, nonce, model, provider: "near" })}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "x-no-aliasing": "true" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Attestation failed (${res.status})`);
  const data = (await res.json()) as { gateway_attestation: Report; model_attestations?: Report[] };
  return {
    nonce,
    model,
    gateway: checkQuote(data.gateway_attestation, nonce),
    models: (data.model_attestations ?? []).map((m) => checkQuote(m, nonce)),
    quotes: { gateway: data.gateway_attestation.intel_quote, models: (data.model_attestations ?? []).map((m) => m.intel_quote) },
  };
}

// ---------------------------------------------------------------- signatures

/** EIP-191 personal_sign recovery: returns the 0x address that signed `text`. */
export function recoverEip191(text: string, signatureHex: string): string {
  const msg = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...msg]));
  const sig = hexToBytes(signatureHex);
  if (sig.length !== 65) throw new Error("Signature must be 65 bytes");
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const pub = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact").addRecoveryBit(v).recoverPublicKey(digest).toBytes(false);
  return `0x${bytesToHex(keccak_256(pub.slice(1)).slice(-20))}`;
}

type SignatureResponse = { text?: string; signature?: string; signing_address?: string; signing_algo?: string; signature_kind?: string };

async function fetchSignature(chatId: string): Promise<SignatureResponse> {
  const url = `${BASE}/signature/${encodeURIComponent(chatId)}?signing_algo=${ALGO}`;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey()}` }, cache: "no-store" });
    if (res.ok) {
      const s = (await res.json()) as SignatureResponse & { error_code?: string };
      if (s.signature && !s.error_code) return s;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error("NEAR AI did not return a signature for this reply");
}

// ---------------------------------------------------------------- one verified thought

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type VerifiedThought = {
  reply: string;
  model: string;
  chatId: string;
  requestHash: string;
  responseHash: string;
  signature: string;
  signingAddress: string;
  signingAlgo: string;
  signatureKind: string;
  /** All checks passed: attested signer, signed text matches our hashes, signature recovers to the signer. */
  verified: boolean;
  checks: { attestation: boolean; textMatches: boolean; signerRecovered: boolean; signerAttested: boolean };
  attestation: Attestation;
  raw: { request: string; response: string };
};

export async function think(messages: ChatMessage[], model = NEAR_AI_MODEL): Promise<VerifiedThought> {
  const attestation = await attest(model);

  const request = JSON.stringify({ model, messages, max_tokens: 160, temperature: 0.9 });
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      "x-no-aliasing": "true",
      "Accept-Encoding": "identity",
    },
    body: request,
    cache: "no-store",
  });
  const response = await res.text();
  if (!res.ok) throw new Error(`NEAR AI: ${res.status} ${response.slice(0, 200)}`);
  const parsed = JSON.parse(response) as { id: string; choices: { message: { content: string } }[] };
  const reply = (parsed.choices?.[0]?.message?.content ?? "").trim();
  const requestHash = sha256hex(request);
  const responseHash = sha256hex(response);

  const s = await fetchSignature(parsed.id);
  const kind = s.signature_kind ?? "provider_tee";
  const expectedText = kind === "gateway" ? `${requestHash}:${responseHash}` : `${model}:${requestHash}:${responseHash}`;
  const textMatches = s.text === expectedText;
  let recovered = "";
  try {
    recovered = recoverEip191(s.text ?? "", s.signature ?? "");
  } catch {
    recovered = "";
  }
  const signer = (s.signing_address ?? "").toLowerCase();
  const signerRecovered = recovered.toLowerCase() === signer;
  const attested = kind === "gateway" ? [attestation.gateway] : attestation.models;
  const matching = attested.filter((c) => c.signingAddress === signer);
  const signerAttested = matching.length === 1 && passed(matching[0]);
  const attestationOk = attested.length > 0 && attested.every(passed);

  return {
    reply,
    model,
    chatId: parsed.id,
    requestHash,
    responseHash,
    signature: s.signature ?? "",
    signingAddress: signer,
    signingAlgo: s.signing_algo ?? ALGO,
    signatureKind: kind,
    verified: textMatches && signerRecovered && signerAttested && attestationOk,
    checks: { attestation: attestationOk, textMatches, signerRecovered, signerAttested },
    attestation,
    raw: { request, response },
  };
}
