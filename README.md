# Bitty Beasts

*A cat with a mind of its own. Nine lives to spend.*

An AI pet on NEAR. Your cat lives in a room above Lantern Lane: you feed it, dress it, give it a
personality and talk to it. It thinks with **NEAR AI** inside hardware-sealed enclaves, **every
reply is cryptographically verified before it is recorded on chain**, and **the cat pays for its
own thoughts** — 1 YARN from its own NFT-bound NEAR account.

Then you take it out at night: rooftop prowls, a market run by merchant cats that set their own
prices, and a nightly community goal where everything — your cat, every shop, the alley itself —
has nine lives.

![Bitty Beasts title screen](docs/shots/01-title.png)

## Where this came from

[Illia Polosukhin](https://x.com/ilblackdragon/status/2106269343881519444) sketched an idea on X:

> **AI Tamagochi** — use @near_ai to run verifiable inference from prompt encoded onchain, have
> each character as NFT with some $NEAR attached that pays for it's inference, add gamification
> with feeding, dressing. Can add all kinds of things on top with battle arena, competitions, etc.

We built it. Every clause of that sentence is a thing you can do in this game, and the first three
are the parts we cared most about getting right:

| The idea | What we built |
| --- | --- |
| verifiable inference from @near_ai | Every reply is checked against a fresh-nonce TEE attestation before it counts. A reply that fails verification is thrown away. |
| prompt encoded onchain | The cat's personality, mood, hunger, scars and diary all live in the contract. The prompt is assembled from those, and nothing else. |
| each character as NFT | Each cat is an NEP-171 token **and** its own NEAR account. |
| with some $NEAR attached that pays for its inference | The cat holds its own balance and spends it to think — not your wallet, the cat's. It pays in $YARN rather than $NEAR, so the cost of thinking is part of the game's economy. |
| gamification with feeding, dressing | Fullness and happiness decay on chain. Food and clothes are NEP-245 tokens the cat owns. |
| battle arena, competitions | Not built. Rooftop prowls and a nightly community goal instead. |

The one deliberate change: **nine lives.** A Tamagotchi dies and you start again. A cat on this
street can lose a life on a bad jump, and the scar is written into its diary forever — so the
stakes are real without being final.

| | |
| --- | --- |
| **Live on** | NEAR testnet — `alley.bittybeasts-6f61b7.testnet` |
| **Contracts** | 3 Rust contracts: NEP-171 + NEP-245 + market, NEP-141, NEP-591 global contract |
| **Verified on testnet** | 20/20 game checks, 13/13 cat-room checks (incl. 3 NEAR AI checks), 26/26 economy checks, 54 contract unit tests |
| **Tracks** | Games With Real Economies · NFTs That Do Something · Memecoins With Mechanics · Grand Prize (NEAR AI) |

---

## How we know the cat really said that

An AI pet is easy to fake: any server can call a model and tell you a cat said it. Here you can
check. Every reply is proved to have come from the sealed hardware it claims, before it counts.

![The verified thought panel](docs/shots/05-verified-thought.png)

Those four ticks are not decoration. For every reply, the server:

1. Fetches `/v1/attestation/report` with **a fresh 32-byte nonce**, and parses the raw Intel TDX
   quotes for the gateway *and* the model. It checks `report_data == signing address ‖ zero padding
   ‖ our nonce`, that the **TD debug bit is off**, that `MRCONFIGID == 01 ‖ sha256(app_compose) ‖
   0x00 × 15`, and that the NVIDIA GPU evidence carries the same nonce.
2. Runs the completion with `x-no-aliasing: true`, keeping the **exact request and response bytes**.
3. Fetches `/v1/signature/{chat_id}`, rebuilds the signed text `model:sha256(request):sha256(response)`
   **from its own hashes**, recovers the EIP-191 signer, and requires it to equal the attested
   model signer.
4. Only then calls `record_thought`. An unverified reply is dropped and costs the player nothing.

**Check it in one command.** This runs the same code against live NEAR AI and prints every check
(needs `NEAR_AI_API_KEY`):

```sh
./node_modules/.bin/tsx scripts/verify-attestation.ts
```

```
Attestation (fresh 32-byte nonce, raw Intel TDX quotes)
  ok   gateway: our nonce is inside the quote's report_data
  ok   gateway: report_data also binds the signing address
  ok   gateway: TD debug mode is off
  ok   gateway: MRCONFIGID matches sha256(app_compose)
       signer 0xb98a789cdc4817275f5155593ba73ef2a957e779
  ok   model[0]: our nonce is inside the quote's report_data
  ok   model[0]: NVIDIA GPU evidence carries our nonce
       signer 0x2665cce942fa427ef30d87f4b0bff67fb7645462

One real thought, verified end to end
  ok   attestation passed
  ok   signed text is exactly model:sha256(request):sha256(response)
  ok   signature recovers to the address that signed it
  ok   that address is the one inside the attested enclave
```

Where it lives: [`lib/server/nearai.ts`](lib/server/nearai.ts) (the checks) ·
[`app/api/cat/talk/route.ts`](app/api/cat/talk/route.ts) (the gate) ·
[`contracts/alley/src/care.rs`](contracts/alley/src/care.rs) (`record_thought`).
The byte-level walkthrough, and what this deliberately does **not** verify, is in
[docs/TEE-VERIFICATION.md](docs/TEE-VERIFICATION.md).

**This runs live.** A thought recorded on testnet, read back from the chain just now:

```json
{
  "said":  "Hey Noddle how are you feeling todauy",
  "reply": "*Purrs and stretches, tail curling like a question mark*\nFull as a bell, but my nine lives are already glowing.\nWant a fish? I've got rooftops to brag about.",
  "model": "Qwen/Qwen3-VL-30B-A3B-Instruct",
  "chat_id": "chatcmpl-f92745af-41a0-4d27-8fae-dfe8ac3525cd",
  "request_hash":  "d03994802dbd9c198cb24522ebe89047a225106d9972cfe6e623d8fd9b261d2f",
  "response_hash": "eeabfe6cd99f1d6d077809c9fab8ba988e9ec068da979aca268217ac33a4b6be",
  "signature": "0xca501c14e67676d5a3b805086ad700c4a86d52e194d82e5d051c997e7616111268004aa2e56c135e0e0dd419b768aed3d31d698d9ab8f483f965ef0152cd9d141c",
  "signing_address": "0x2665cce942fa427ef30d87f4b0bff67fb7645462",
  "signing_algo": "ecdsa"
}
```

Reproduce it:

```sh
near contract call-function as-read-only alley.bittybeasts-6f61b7.testnet thoughts \
  json-args '{"token_id":"demo-cat-3","limit":2}' network-config testnet now
```

The raw bytes stay available at `/api/cat/thought/<chat_id>`, so anyone can recompute both hashes
and check the signature themselves.

---

## Who actually owns the cat

Two things make this ownership rather than a database row, and both are visible on chain.

**1. A Beast's account has exactly one key, and it can only call `execute`.**

```sh
near account list-keys demo-cat-1.alley.bittybeasts-6f61b7.testnet network-config testnet now
```

One row comes back, and it reads:

> `ed25519:3ZBsSkPHxmm1QWRJEE265NLXL8co9tENkowBMqG17bN5` — only do `["execute"]` function calls on
> `demo-cat-1.alley.bittybeasts-6f61b7.testnet` with an allowance of 0.244 NEAR

No full-access key, and nothing it can call but its own `execute`. The NFT owner holds that one
key; the alley swaps it on every sale, deleting the old one **in the same receipt**.

**2. Nobody can mint $YARN outside the rules — including us.**

$YARN mints only when the **alley** reports a nightly check-in, so a keyless token alone would not
be enough: whoever could upgrade the alley could change who mints. Both accounts hold **zero**
access keys, so neither can ever be redeployed.

```sh
near account list-keys yarn.bittybeasts-6f61b7.testnet  network-config testnet now
near account list-keys alley.bittybeasts-6f61b7.testnet network-config testnet now
```

Both print an empty key table — no full-access key, no function-call key, nothing. (The RPC answers
the same question without the CLI: `view_access_key_list` returns `{"keys": []}` for each.)

The parameters are Rust constants compiled into the token and `params()` reports `admin: null`.
`scripts/deploy.ts` deletes $YARN's only full-access key after init; `scripts/lock-alley.ts` checks
the deployed code matches the local build, then does the same for the alley.

Both ends of the mint path are immutable. That cuts both ways, and the cost is real: **no bug in
either contract can ever be fixed.** A mainnet launch would deploy fresh contracts and lock them
only after an audit.

---

## Play it in two clicks

No wallet, no seed phrase, no gas prompt, no extension.

| Start your own cat | Or borrow one |
| --- | --- |
| ![Sign in](docs/shots/02-signin.png) | ![Pick a cat](docs/shots/03-pick-a-cat.png) |

Sign in with Google and the server provisions `p<hash>.ROOT` with a key generated in your browser,
then a kitten arrives with welcome gifts from two merchants — each signed by that merchant's own
NEAR key. Or borrow a demo cat: the picker reads every cat's **real on-chain state** (lives, scars,
best stat) so you know who you are choosing.

> Demo keys are published in [`public/demo-accounts.json`](public/demo-accounts.json) **on purpose**
> — testnet NEAR is worth nothing, and nobody should need to make an account just to look around.
> Server keys stay in `.env.local`, never committed.

---

## The loop

### Your room — care that lives on chain

![The cat room](docs/shots/04-room.png)

Fullness and happiness decay with real time, on chain. **Feed** burns a fish from the *cat's own*
account. **Wardrobe** wears NEP-245 cosmetics the cat owns. **Personality** writes who your cat is
on chain — and that text goes into the prompt. A starving cat cannot take a daring run.

The cat's prompt is built *only* from contract views: name, lives, marks, best run, persona,
fullness, happiness, outfit, diary, and its last four recorded thoughts
([`lib/server/cat.ts`](lib/server/cat.ts)). Nothing is invented client-side.

### Missions — nine lives, really spent

![Choose tonight's prowl](docs/shots/09-prowl.png)

Safe run: loot is minted to the Beast's own account. Daring run that falls: **a link goes dark and
a scar is written into the diary, permanently.** The contract caps the haul by rooftops
([`lib.rs:376`](contracts/alley/src/lib.rs#L376)), so even a compromised referee key cannot print items.

### Lantern Lane — four agents with their own purses

![Lantern Lane](docs/shots/07-lantern-lane.png)

Each merchant is a separate NEAR account with its own YARN purse, till and shelf. It reads the live
alley, prices with [`lib/economy/pricing.ts`](lib/economy/pricing.ts) (16 numbered rules), and
**signs the quote with its own key**. The contract verifies that ed25519 signature before trading
and records a nonce, so a quote cannot be replayed (`market.rs: verify_quote`).

Tap any price to hear the reasoning:

![Merchant price reasoning](docs/shots/08-merchant-reasoning.png)

> *"YARN's scarce since the burn; it buys more. You brought what I asked for. Fine. Extra. 3 YARN,
> take it or leave it."*

That sentence is assembled from the rules that actually produced the number — scarcity after a
burn, plus the +25% because Tom had posted a request for fish that night. Merchants go dark when
their till empties, and players relight them.

### $YARN — a memecoin that needs you to show up

![$YARN tonight](docs/shots/10-yarn-tonight.png)

Each night, every woken Beast may **check in once** (a cuddle or a finished prowl). If at least 60%
of registered Beasts check in, every one of them gets 10 YARN. If not, **the alley loses one of its
nine lives and 5% of the treasury burns**. Seven good nights in a row wins a life back. At zero, the
Age ends and a new one begins.

Supply is driven by attendance, not by holding. Every mint and burn is on chain:

![Every mint and burn](docs/shots/11-mints-and-burns.png)

The screenshot above is the honest state of a testnet alley that is mostly empty: misses, burns, and
an Age that keeps turning over. That is the mechanic working, not a bug.

A 60-night model of the same rules ([`scripts/simulate-yarn.ts`](scripts/simulate-yarn.ts), which
mirrors the contract's constants) — clearly labelled in the UI as a model, not chain data:

![Modelled supply over 60 nights](docs/shots/12-supply-model.png)

| Scenario | Final supply | Burned | Missed nights | Resets |
| --- | ---: | ---: | ---: | ---: |
| Steady community | 52,188 | 1,952 | 3 | 0 |
| Weekend dips | 40,639 | 7,971 | 17 | 1 |
| Slowly fading | 22,390 | 12,850 | 35 | 3 |

### The Ledger — a story nobody writes

![The Lantern Ledger](docs/shots/13-ledger.png)

Each edition is assembled from the $YARN log, the alley's night stats and the Beasts' diaries
([`lib/story/ledger.ts`](lib/story/ledger.ts)). The merchants' requests on the notice board are
derived from their own shelves. There is no script and no final mission.

---

## Every move is a transaction

![On-chain activity](docs/shots/14-on-chain.png)

Pick any account — the alley, $YARN, the game server, a merchant, your cat's own account — and read
its real history from the NearBlocks indexer, then open any transaction on the explorer.

And every Beast has a life story where **each diary line links to the transaction that wrote it**:

![A Beast's life story](docs/shots/06-life-story.png)

Note the two lines together: *"Bought 3 thought(s) with its own YARN"* and the thought itself. That
is the whole AI-pet economy in two transactions — the cat spent its own money to think.

---

## What we entered, and what carries it

One game, four tracks. Each row is a part of the build, not a separate project.

| Track | What answers it | Where to look |
| --- | --- | --- |
| **Grand Prize (NEAR AI)** | TEE attestation with a fresh nonce, raw TDX quote parsing (nonce + signer binding, debug bit, MRCONFIGID, GPU nonce), response-signature recovery matched to the attested signer, then `record_thought` on chain. Unverified replies are dropped. | `lib/server/nearai.ts`; the `thoughts` view above |
| **Games With Real Economies** | 4 merchant agents with their own accounts, purses and **signed** quotes; 16 pricing rules with player-visible reasoning; NEP-245 food and cosmetics; stalls, rent and lights-out shops revived by players; Google sign-in with no seed phrase | `lib/economy/pricing.ts`, `contracts/alley/src/market.rs` |
| **NFTs That Do Something** | Each Beast is NEP-171 **and its own NEAR account** holding its YARN, items, stall earnings, lives, persona and thought credits — and paying for its own AI. Control = one function-call key, swapped by the contract on sale. Royalties (NEP-199), marketplace approvals (NEP-178). Every Beast account also answers `nft_item_info` per **`sharded-item-1.0.0`**, the [Top Level Accounts](https://github.com/houseofstake/tla-contracts) draft NEP for collections whose tokens are real accounts. | `near list-keys` above; [docs/sharded-nft-items.md](docs/sharded-nft-items.md) |
| **Memecoins With Mechanics** | NEP-141 with **zero access keys**, compiled-in parameters, `admin: null`. Nightly community check-in mints; missed nights burn. Every AI thought is a YARN sink into the treasury. | `near list-keys yarn.…` above |

---

## Live contracts

| Contract | Account |
| --- | --- |
| Alley (NEP-171 + NEP-245 + market) | [`alley.bittybeasts-6f61b7.testnet`](https://testnet.nearblocks.io/address/alley.bittybeasts-6f61b7.testnet) |
| $YARN (NEP-141, no access keys) | [`yarn.bittybeasts-6f61b7.testnet`](https://testnet.nearblocks.io/address/yarn.bittybeasts-6f61b7.testnet) |
| beast-wallet (NEP-591 global contract) | [`wallet.bittybeasts-6f61b7.testnet`](https://testnet.nearblocks.io/address/wallet.bittybeasts-6f61b7.testnet) |
| A Beast's own account | [`demo-cat-1.alley.bittybeasts-6f61b7.testnet`](https://testnet.nearblocks.io/address/demo-cat-1.alley.bittybeasts-6f61b7.testnet) |
| Merchant agents | `tom.` · `miso.` · `bandit.` · `clove.bittybeasts-6f61b7.testnet` |

```
ROOT (game server: referee + funder)
├── alley.ROOT          Beasts (NEP-171) + items (NEP-245) + Lantern Lane
│   └── <token>.alley.ROOT   one account per Beast, runs the beast-wallet global contract
├── yarn.ROOT           $YARN (NEP-141), keys deleted after init
├── wallet.ROOT         publishes beast-wallet as a NEP-591 global contract
├── studio.ROOT         the artist: registers Beasts, receives royalties
├── tom / miso / bandit / clove.ROOT    merchant agents
└── p<hash>.ROOT        players (Google sign-in)
```

---

## Tests

Run against the **live testnet contracts**, not mocks.

| What | Command | Result |
| --- | --- | --- |
| Live testnet, one Beast's whole life | `tsx scripts/e2e.ts` | **20/20 passed** |
| Cat room on testnet (needs the app running) | `BASE_URL=… tsx scripts/e2e-room.ts` | **13/13 passed**, incl. 3 NEAR AI checks |
| Economy rules and nightly requests | `tsx scripts/check-economy.ts` | **26/26 passed** |
| NEAR AI attestation, on its own | `tsx scripts/verify-attestation.ts` | **9/9 passed** against live NEAR AI |
| Contract unit tests | `cd contracts && cargo test` | **54 passed** (alley 34, beast-wallet 11, yarn 9) |

The resale security model is covered by the e2e run, each line a real transaction:

```
ok  wander: seller cannot move anything out (wallet frozen)  (rejected)
ok  adopt: old key deleted, only the buyer's key remains  (1 key(s))
ok  adopt: lives, marks and YARN moved with the Beast
ok  adopt: maker received the 10% royalty  (10000000000000000000000 yocto)
ok  adopt: the seller's old key is rejected
ok  a used quote cannot be replayed
```

Every $YARN supply rule is enforced by the contract and tested in Rust, not only by the
TypeScript model used for the 60-night chart (`cargo test -p yarn`):

```
ok  genesis_and_params_are_fixed
ok  only_alley_can_tug
ok  good_night_mints_to_tuggers
ok  missed_night_burns_and_costs_a_life
ok  seven_good_nights_win_a_life_back
ok  nine_misses_reset_the_streak_and_refill
ok  breaking_the_longest_night_starts_one_festival
ok  transfers_do_not_pay_storage_for_strangers
ok  transfers_to_beast_accounts_are_registered_for_free
```

And the NEAR AI path, end to end on a fresh player account:

```
ok  thoughts: 3 YARN from the kitten's purse buys 3 thoughts
ok  talk: NEAR AI replied and every check passed
    {"attestation":true,"textMatches":true,"signerRecovered":true,"signerAttested":true}
ok  talk: the thought is recorded on chain and one credit spent
ok  talk: on-chain record carries NEAR AI's chat id and signature
```

### Threat model: every way a seller could keep the money

| Attempt | What stops it | Proof |
| --- | --- | --- |
| Drain YARN or items before the sale | `wander` freezes the wallet; `execute` panics | e2e: "seller cannot move anything out" |
| Keep an old access key | `adopt` deletes it in the same receipt | e2e: "only the buyer's key remains" |
| Sell mid-payout | Payouts target the **Beast's account**, so late arrivals belong to the buyer | e2e: "YARN moved with the Beast" |
| Burn lives on reckless runs after agreeing a price | A wandering Beast cannot prowl | unit test `wandering_beast_cannot_prowl` |
| Re-adopt their own Beast | `adopt` rejects the seller | unit test `seller_cannot_readopt` |
| Replay a merchant's price | Each quote carries a nonce the contract records | e2e: "a used quote cannot be replayed" |
| Use the old key after selling | The wallet only obeys the current controller; only the alley can swap it | `an_old_key_is_refused_after_a_handover` |
| Re-use a photo of the QR card | Only a live wander can be adopted, once. **Limit:** whoever saw the card knows the secret; the physical product needs NFC | — |
| Hand over the keychain without starting a wander | Not fixable on chain. Buyers should pay only once the Beast is wandering | — |

---

## Run it

Requirements: Node 24, pnpm, Rust stable with `wasm32-unknown-unknown`, `cargo-near`.

```sh
pnpm install
pnpm approve-builds                  # allow esbuild (used by tsx)

# contracts
cd contracts && cargo test && for c in beast-wallet yarn alley; do
  (cd $c && cargo near build non-reproducible-wasm --no-abi); done; cd ..

# deploy to testnet: creates accounts through the faucet (free), deploys the contracts
# (and deletes $YARN's key), registers Beasts, creates the demo players. Keys -> .env.local
./node_modules/.bin/tsx scripts/deploy.ts

# the cat's brain: a NEAR AI Cloud API key (cloud.near.ai -> API Keys)
echo "NEAR_AI_API_KEY=..." >> .env.local    # optional: NEAR_AI_MODEL

# Google sign-in
echo "NEXT_PUBLIC_GOOGLE_CLIENT_ID=..." >> .env.local

pnpm dev                             # http://localhost:3000

pnpm story:render                    # the story film as out/story.mp4
```

Optional: keep the world turning (closes nights, settles $YARN, merchants restock):

```sh
set -a; source .env.local; set +a; ./node_modules/.bin/tsx scripts/keeper.ts
```

### Walk the whole loop yourself

1. `tsx scripts/e2e.ts` — 20 checks against the deployed contracts.
2. On `/`, **Meet your cat** → **Borrow a cat** → pick one. You are playing a real testnet account.
3. **Feed**, **Wardrobe**, **Personality**, **Cuddle** in `/room`. Each is a transaction.
4. **Talk**, then tap **verified thought** to see the attestation, signer, hashes and raw bytes.
5. `/alley` → **prowl**. Take the daring run and watch a life go dark.
6. Sell to Old Tom in Lantern Lane; hover the price to read his reasoning.
7. `/yarn` — your prowl moved tonight's bar. Press **Settle the night** after it ends.
8. `/ledger`, then `/activity` — read it all back from the chain.
9. `/beast/<token>` — every diary line links to the transaction that wrote it.

---

## Repository map

```
contracts/      alley (NEP-171 + NEP-245 + market), yarn (NEP-141), beast-wallet (global contract)
app/            Next.js 16 pages and route handlers (api: auth, prowl referee, merchant agents)
lib/chain/      browser chain layer (keys, views, signed actions, Borsh for the wallet)
lib/economy/    pricing.ts, requests.ts, events.ts, yarn.ts, sim.ts, live.ts
lib/server/     server keys, Google token verification, merchant quote signing, nearai.ts, keeper.ts
lib/story/      world.ts, ledger.ts (the Lantern Ledger and the Ages)
remotion/       the story film: script.ts, world.tsx, scenes.tsx
scripts/        deploy.ts, e2e.ts, e2e-room.ts, keeper.ts, good-night.ts, lock-alley.ts,
                simulate-yarn.ts, check-economy.ts, verify-attestation.ts,
                slice-sheets.mjs, slice-ui.mjs
docs/           STORY.md, ARCHITECTURE.md, TEE-VERIFICATION.md, sharded-nft-items.md,
                yarn-sim.{md,svg,csv}, shots/
```

Art — cats, merchants, scenes and the UI kit — is the artist's own work (`public/sheets`,
`public/bg`, cut into `public/art` by `scripts/slice-sheets.mjs` and `scripts/slice-ui.mjs`).

More: [docs/STORY.md](docs/STORY.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/TEE-VERIFICATION.md](docs/TEE-VERIFICATION.md) ·
[docs/sharded-nft-items.md](docs/sharded-nft-items.md) · [docs/yarn-sim.md](docs/yarn-sim.md)
