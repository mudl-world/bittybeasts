# How a cat's thought is verified

The cat thinks with [NEAR AI Cloud](https://cloud.near.ai), which runs models inside TEEs —
hardware-sealed enclaves. This document is about the part that matters: **we do not take NEAR AI's
word for any of it**, and neither should you.

A reply is recorded on chain only after four checks pass. One that fails is thrown away, costs the
player nothing, and never touches the chain.

**Run it yourself** (needs `NEAR_AI_API_KEY` in `.env.local`):

```sh
./node_modules/.bin/tsx scripts/verify-attestation.ts
```

That hits live NEAR AI, prints every check, and exits non-zero if any fail.

| Where | What |
| --- | --- |
| [`lib/server/nearai.ts`](../lib/server/nearai.ts) | all verification: quote parsing, attestation, signer recovery |
| [`app/api/cat/talk/route.ts`](../app/api/cat/talk/route.ts) | the gate: records on chain only if `verified` |
| [`scripts/verify-attestation.ts`](../scripts/verify-attestation.ts) | runs the path on its own |
| [`contracts/alley/src/care.rs`](../contracts/alley/src/care.rs) | `record_thought` — where a verified thought lands |

## 1. Attestation, before the completion

`attest()` generates **a fresh 32-byte nonce** and calls
`GET /v1/attestation/report?nonce=…&model=…&provider=near`.

The nonce is the whole point. Without it, an attestation report is just a document that could have
been captured once and replayed forever. Because the enclave has to bake *our* random nonce into
the signed quote, the report can only have been produced after we asked.

We then parse the **raw Intel TDX quote** rather than trusting the JSON fields beside it — those
are just the server telling us what it would like us to believe. `checkQuote()` reads the TD quote
body (after the 48-byte header) and checks four things:

| Check | Bytes | What it proves |
| --- | --- | --- |
| `nonceBound` | `report_data[32..64]` | the quote was made for *this* request |
| `signerBound` | `report_data[0..20]` = signing address, `[20..32]` zero | the key signing replies is the one inside this enclave |
| `debugOff` | `td_attributes[0] & 1 == 0` | debug mode off — a debuggable TD can have its memory inspected |
| `configMeasured` | `MRCONFIGID` = `01 ‖ sha256(app_compose) ‖ 0x00 × 15` | the enclave runs the configuration it claims |

If the response carries NVIDIA GPU evidence, we require our nonce in that too.

Both the gateway and the model are attested, and they are **different enclaves with different
signers** — the script prints both.

## 2. The completion

Sent with `x-no-aliasing: true` and `Accept-Encoding: identity`. We keep the **exact request and
response bytes**, because the signature is over hashes of those bytes, and any re-encoding — a
re-serialized JSON object, a gzip round-trip — would change the hash and break the proof.

## 3. The response signature

`GET /v1/signature/{chat_id}` returns a signature over `model:sha256(request):sha256(response)`.

We rebuild that string **from our own hashes of our own bytes**, never from what the API reports,
then recover the EIP-191 signer with secp256k1 and require it to equal the address we attested in
step 1.

So the chain closes: nonce → enclave → signing key → signature → the exact bytes we hold.

## 4. Only then, on chain

`record_thought` stores the reply, both hashes, the chat id, the signature and the signer. The raw
bytes stay available at `/api/cat/thought/<chat_id>` so anyone can recompute the hashes.

```
verified = attestation && textMatches && signerRecovered && signerAttested
```

All four, or nothing is recorded.

## What this does not do

**Full Intel DCAP signature-chain verification is not run here**, and neither is NVIDIA NRAS. We
check what is *inside* the quote — nonce, signer, debug bit, measured config — but we do not walk
the certificate chain back to Intel's roots to prove the quote is authentically Intel-signed.

A quote forged by someone who never ran a real TDX enclave would pass our checks. That is the
honest limit of this implementation.

What we do instead: **every raw quote is kept with its thought**, so anyone can run
[`dcap-qvl`](https://github.com/Phala-Network/dcap-qvl) over them independently. Closing this
properly — verifying the chain in code — is the main thing this would need before mainnet.
