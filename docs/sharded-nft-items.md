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

The three owner-tracking fields are `#[borsh(default)]` because Beasts were already deployed with
the earlier five-field state: they deserialize as `None` / epoch 0 and fill in on their next
control change, rather than bricking every existing account when the wallet is republished.

## Status in this repo

Written and unit-tested, **not yet deployed**. The live Beast accounts still run the previous
wallet build, so `nft_item_info` does not resolve on chain yet — republishing the global contract
is what makes it live. Everything else in the NFT path (NEP-171, the one-key control model,
royalties, approvals) *is* deployed and verifiable on testnet.
