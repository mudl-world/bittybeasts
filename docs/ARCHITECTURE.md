# Bitty Beasts — Architecture

The single source of truth for interfaces. Contracts, API routes and UI all build against this file.

## Accounts (NEAR testnet)

`ROOT` is configured in `.env.local` (`NEXT_PUBLIC_ROOT_ACCOUNT`, e.g. `bittybeasts-6f61b7.testnet`).

| Account | Role |
| --- | --- |
| `ROOT` | Game server: referee (settles prowls), funder (creates player accounts). Key only in server env. |
| `alley.ROOT` | **Alley contract**: NEP-171 Beasts + NEP-245 items + lives, marks, diary, market, stalls, wander/adopt. |
| `yarn.ROOT` | **$YARN contract**: NEP-141 + the alley's nine lives. Full-access key deleted after init (no admin). |
| `wallet.ROOT` | Holds the **beast-wallet** global contract code (NEP-591, deployed by account id). |
| `studio.ROOT` | The artist. Registers Beasts, receives royalties. |
| `tom.ROOT`, `miso.ROOT`, `bandit.ROOT`, `clove.ROOT` | Merchant agents. Each has its own key, holds $YARN, signs price quotes. |
| `<beastId>.alley.ROOT` | One account per Beast, running the beast-wallet code. Holds the Beast's $YARN and items. |
| `<hash>.ROOT` | Player accounts created on email sign-in, key generated in the browser. |
| `demo1..demo5.ROOT` | Public demo players (keys in `public/demo-accounts.json` on purpose; testnet only). |

## How control works (NFT track)

- The NFT owner (`owner_id`, a player account) controls the Beast's account through **one function-call access key**
  on `<beastId>.alley.ROOT`, scoped to that account's own `execute` method. The key's public key is the
  wallet's `controller`.
- The beast-wallet accepts `execute` only when `signer_account_pk == controller` and the wallet is not frozen,
  and only forwards calls to `alley.ROOT` and `yarn.ROOT`. It has no method that sends NEAR out.
- Only `alley.ROOT` can call `set_controller` / `set_frozen`. `set_controller` **deletes the old key** and adds the
  new one in the same receipt.
- `nft_transfer` revokes the controller immediately; the new owner calls `bind_key`.
- NEP-178: `nft_approve` / `nft_revoke` / `nft_revoke_all` / `nft_is_approved`. An approved account (a marketplace) may
  transfer the Beast once; every owner change clears all approvals.
- `wander` freezes the wallet and blocks prowls/stall edits; `adopt` pays the seller (minus NEP-199 royalty to
  the studio), moves the NFT, swaps the key, and unfreezes.

## Alley contract (`contracts/alley`)

Item token ids (NEP-245): `fish`, `button`, `bell`, `moonstone`, `charm`, `catnip`, `lantern`.

Beast view (`beast(token_id)`):
```ts
type Beast = {
  token_id: string; owner_id: string; account_id: string;      // <token_id>.alley.ROOT
  name: string; maker: string; born_ms: number; media: string;  // media = path under /art (placeholder)
  stats: { reach: number; grip: number; speed: number; luck: number }; // 1..10
  lives: number;            // 0..9 lit links
  lives_lost_total: number; lives_won_total: number; legend: boolean;
  marks: { kind: string; note: string; at_ms: number }[];
  woken: boolean; controller: string | null;                  // ed25519:... public key
  wander: { seller: string; price: string; until_ms: number; nonce: number } | null;
  last_boop_ms: number; best_run: number; reputation: Record<string, number>; // per merchant
};
```

Change methods (who may call):
- `register_beast(token_id, name, media, stats, claim_hash)` — studio, attach ≥0.2 NEAR (creates the Beast account).
- `wake(token_id, secret, controller_pk)` — anyone holding the QR secret; first claim only. Owner := caller, lives := 9.
- `bind_key(token_id, controller_pk)` — owner.
- `boop(token_id, secret)` — owner; once per day (day = `night_ms`). +1 life (max 9) and tugs $YARN.
- `settle_run(token_id, daring, rooftops, haul: [[item, amount]], fell, mark?, whips_on_awning: {merchant: n}, binds: n)` — referee only.
  Caps haul by rooftops; daring fall costs a life + adds mark + drops haul unless a `charm` is burned.
  Every finished run tugs $YARN for that Beast.
- `wander(token_id, price)` / `cancel_wander(token_id)` — owner. `end_wander(token_id)` — anyone after `until_ms`.
- `adopt(token_id, secret, controller_pk)` — payable (≥ price, in yoctoNEAR); keychain secret required.
- `sell_to_merchant(quote, signature)` — called **by a Beast account** (via its wallet). Quote signed by the merchant key.
- `open_stall(slot)`, `set_stall_rules(rules)`, `close_stall()` — called by a Beast account.
- `close_night()` — anyone, once per night: merchants with an empty till lose a lantern; stalls pay rent or lose a lantern.
- `ft_on_transfer(sender_id, amount, msg)` — $YARN in. `msg` JSON:
  `{"till":{}}` (merchant restocks own till) · `{"rent":{}}` (Beast prepays stall rent) ·
  `{"buy_merchant":{"quote":Quote,"signature":"base64"}}` · `{"buy_stall":{"slot":n,"item":"fish","amount":"2","price_per":"3"}}` ·
  `{"revive":{"target":"tom.ROOT" | "stall:3"}}`.

```ts
type Quote = { merchant: string; beast: string; side: "sell" | "buy"; item: string; amount: string;
               price_per: string; expires_ms: number; nonce: number }; // YARN in whole units (decimals 0)
```
Signature = ed25519 over `borsh`-free canonical bytes: `JSON.stringify(quote)` with keys in the order above.

Views: `beast`, `beasts(from, limit)`, `beasts_for_owner(account_id)`, `history(token_id, from, limit)`,
`merchants()` → `{ account_id, name, till, lanterns, open, inventory: Record<item, string>, sold_tonight }[]`,
`stalls()`, `night()`, `nft_*`, `mt_*`, `nft_payout`.

## $YARN contract (`contracts/yarn`) — Memecoins track

NEP-141, `decimals = 0`, symbol `YARN`. Parameters are constants compiled in and returned by `params()`:

| Param | Value |
| --- | --- |
| `target_bps` | 6000 (60% of registered Beasts) |
| `mint_per_tug` | 10 |
| `burn_bps` | 500 (5% of treasury on a miss) |
| `max_lives` | 9 |
| `regen_every` | 7 consecutive good nights |
| `night_ms` | set once at init (demo: 10 minutes) |

- `tug(beast_account, registered_beasts)` — only `alley.ROOT` (fixed at init). One tug per Beast per night.
- `settle()` — anyone. Settles every finished night: hit → mint 10 to each tugger, streak +1;
  miss → alley loses a life, 5% of the treasury burns; 0 lives → streak resets to 0, lives refill.
- Treasury = the contract account's own balance (rent and the 2% market fee land there).
- Views: `params()`, `state()` → `{ night, streak, longest, lives, run, tugs_tonight, target_tonight, treasury, total_supply, festival }`, `log(from, limit)` → mint/burn/life entries.
- Emits NEP-297 `ft_mint` / `ft_burn` events plus `yarn_night` events.

## Server (Next.js route handlers, `app/api/*`)

- `POST /api/auth/start {email}` → sends a 6-digit code (Resend if `RESEND_API_KEY`, else returns `devCode`).
- `POST /api/auth/verify {email, code, publicKey}` → creates `<hash>.ROOT` with that key, returns `{accountId}`.
- `POST /api/prowl/settle {tokenId, run}` → validates and calls `settle_run` as referee.
- `POST /api/merchant/quote {merchant, beast, side, item, amount}` → `{quote, signature, price_per, reasoning}` from `lib/economy/pricing.ts` (includes tonight's request bonus from `lib/economy/requests.ts`).
- `GET|POST /api/keeper` → winds the clock: `alley.close_night`, `yarn.settle`, merchant restocking (`lib/server/keeper.ts`). Rate-limited; every call is public and idempotent.
- `POST /api/stall/negotiate` → Beast agent applies owner rules, may counter once.
- `GET /api/state` → aggregated chain state for the UI.

## Client chain layer (`lib/chain/*`)

- `lib/chain/config.ts` — network + account ids from `NEXT_PUBLIC_*` env.
- `lib/chain/keys.ts` — browser key storage (player key + per-Beast controller key).
- `lib/chain/view.ts` — RPC view calls.
- `lib/chain/actions.ts` — signs and sends: player-account calls, and Beast-wallet `execute` calls.

## Economy (`lib/economy/*`)

- `pricing.ts` — every merchant price rule, with a `reasoning` string.
- `events.ts` — automatic events (fish glut, rat swarm, bad night, last lantern, moon festival).
- `sim.ts` — fast-forward simulator (7 nights in ~1 minute) that uses the same `pricing.ts` and `events.ts`.
- `scripts/simulate-yarn.ts` — 60-night $YARN supply simulation, three scenarios, writes `docs/yarn-sim.*`.

## The cat room (`contracts/alley/src/care.rs`, `/room`, `/api/cat/*`)

- Contract (called by the Beast's own account through its wallet): `feed(item)` (fish / catnip, burned),
  `dress(outfit)` (NEP-245 cosmetics `hat`, `scarf`, `bow`, `glasses` the Beast owns), `set_persona(persona)`.
  YARN `{"think":{}}` buys thought credits (1 YARN each, forwarded to the $YARN treasury).
  Referee only: `record_thought(token_id, said, reply, model, chat_id, request_hash, response_hash, signature, signing_address, signing_algo)`.
  Views: `care(token_id)` → `{fullness, happiness, at_ms, outfit, persona, thought_credits, thoughts}`, `thoughts(token_id, from, limit)`.
  Fullness −1/min, happiness −1/90 s; a prowl costs 5 fullness; fullness < 10 blocks daring runs.
- `POST /api/cat/adopt` (signed): the studio registers a free kitten and returns its claim secret to this player only;
  the browser wakes it. Clove and Tom send welcome gifts with their own keys.
- `POST /api/cat/talk` (signed): prompt from chain data → NEAR AI attestation (fresh nonce) → completion → signature
  check → `record_thought`. `GET /api/cat/thought/{chat_id}`: the exact bytes behind the on-chain hashes.

## Story (`lib/story/*`, see docs/STORY.md)

- `world.ts`: the setting, the cold-open panels, Age names.
- `ledger.ts`: `agesFrom(log)` splits the $YARN log into Ages at each `reset`; `writeLedger(...)` writes one edition per finished night from the $YARN log, `night_stats` and the Beasts' `history`; `tonightStories(...)` writes tonight's front page.
- `lib/economy/requests.ts`: nightly merchant requests from shelves, tonight's sales and events.

## Art

All cat and world graphics are **placeholders** under `public/art/` and are supplied by the artist.
See `public/art/README.md` for the slot list.
