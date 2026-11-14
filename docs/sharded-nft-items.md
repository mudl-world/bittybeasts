# Sharded NFT items (`sharded-item-1.0.0`)

Notes on the draft standard from [houseofstake/tla-contracts](https://github.com/houseofstake/tla-contracts)
(Top Level Accounts) and how Bitty Beasts implements it.

## Why it fits a Beast

Most NFT collections keep every token in one contract's storage. A Bitty Beast is already
something else: each token **is** a NEAR account (`<token_id>.alley.ROOT`) that holds its own
$YARN, its own NEP-245 items and its own stall earnings, and signs its own calls. That is exactly
the shape the draft NEP describes — a collection whose items are real accounts, "sharded" across
the account tree instead of living in one contract's map.

## The method

Each item account answers:

```
nft_item_info() -> {
  spec: "sharded-item-1.0.0",
  init: bool,            // has an owner and a controlling key
  status: Parked | Suspended | Expired | Frozen | Active,
  collection_id: AccountId,
  token_id: String,
  owner_id: Option<AccountId>,
  rotation_seq: U64,     // how many times control has changed hands
  rotation_epoch: u32,   // which generation of stored state that counts in
}
```

Implemented in [`contracts/beast-wallet/src/lib.rs`](../contracts/beast-wallet/src/lib.rs).

Status maps onto the game: a wandering Beast (up for adoption, wallet frozen) reports `Frozen`;
a Beast whose controller key has been revoked reports `Parked`; a normal Beast reports `Active`.

## What a consumer must not trust

The two requirements that carry the weight:

1. **The item must name itself.** `token_id` is read from `env::current_account_id()`, never from
   stored state, so an account cannot claim to be a different token.
2. **`collection_id` is only a claim.** Anyone can deploy a contract that names any collection. It
   confers no authority. A consumer has to confirm the claim against the collection itself.

`verifyBeastItem()` in [`lib/chain/view.ts`](../lib/chain/view.ts) is the consumer half: it asks
the account what it is, refuses an unknown spec, refuses an account naming a different token,
then calls the alley's own `nft_token` and refuses if the two disagree about the owner.

## Owner tracking

`set_owner` is callable only by the alley, which pushes it in the **same batch** that rotates the
controller key, so `nft_item_info` reports the state that actually governs the account rather than
a cached copy. Each change of owner bumps `rotation_seq`.

The three owner-tracking fields are read through `deserialize_with = "or_default"`. Accounts
created before those fields existed hold exactly `alley, yarn, controller, frozen, executed`, so
borsh runs out of buffer at `owner`; `or_default` returns the default there instead of erroring,
which is what keeps those accounts readable after the global contract is republished.

(`#[borsh(default)]` does **not** work — borsh 1.8.1 has no such attribute, and an earlier revision
of this file claimed it did.)

## Status in this repo

**Live on testnet.** The global contract was republished on 15 Nov 2026, which swapped the code
under every existing Beast account in one transaction. All 25 Beasts still deserialize and now
answer `nft_item_info`:

```sh
near contract call-function as-read-only \
  demo-cat-1.alley.bittybeasts-6f61b7.testnet nft_item_info json-args '{}' \
  network-config testnet now
```

```json
{"spec":"sharded-item-1.0.0","init":false,"status":"Active",
 "collection_id":"alley.bittybeasts-6f61b7.testnet",
 "token_id":"demo-cat-1.alley.bittybeasts-6f61b7.testnet",
 "owner_id":null,"rotation_seq":"0","rotation_epoch":0}
```

`owner_id` is null and `rotation_epoch` 0 on every existing Beast, which is the honest answer: the
deployed alley predates `set_owner`, so no owner has been recorded on an item account. It is also
why `init` is false. Consumers must not treat `owner_id` as authoritative anyway —
`verifyBeastItem()` confirms ownership against the alley's own `nft_token`, which is the check the
draft NEP actually asks for.

`scripts/republish-wallet.ts` performs the republish and re-checks every Beast afterwards.
