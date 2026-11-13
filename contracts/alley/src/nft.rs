//! NEP-171 (core), NEP-177 (metadata), NEP-178 (approvals), NEP-181 (enumeration), NEP-199 (payouts).
//!
//! Approvals let a marketplace sell a Beast for its owner: the approved account may transfer it once
//! (any owner change clears every approval). A transfer still revokes the old owner's key on the
//! Beast's account, so control never stays with the seller.
//!
//! A plain `nft_transfer` works, but it revokes the old owner's key on the Beast's account in the
//! same call; the new owner binds their own with `bind_key`. The safe resale path is
//! `wander` → `adopt` (see lib.rs), which also pays the seller and the maker's royalty.
use crate::*;
use near_sdk::ext_contract;
use std::collections::HashMap;

const GAS_NFT_ON_TRANSFER: Gas = Gas::from_tgas(35);
const GAS_NFT_ON_APPROVE: Gas = Gas::from_tgas(25);
/// Covers the storage an approval takes (refunded on nothing: approvals are tiny, this is generous).
const APPROVAL_DEPOSIT: NearToken = NearToken::from_millinear(3);

/// Per token: who may transfer it, with their approval ids, and the next id to hand out.
#[near(serializers = [borsh])]
#[derive(Default, Clone)]
pub struct Approvals {
    pub accounts: std::collections::BTreeMap<AccountId, u64>,
    pub next_id: u64,
}

fn approvals_map() -> LookupMap<String, Approvals> {
    LookupMap::new(Key::Approvals)
}

pub(crate) fn approvals_of(token_id: &str) -> Approvals {
    approvals_map().get(token_id).cloned().unwrap_or_default()
}

fn save_approvals(token_id: &str, a: Approvals) {
    let mut m = approvals_map();
    m.insert(token_id.to_string(), a);
    m.flush();
}

/// Called on every owner change: approvals belong to the owner who gave them. The id counter keeps
/// counting, so an old approval id can never match again.
pub(crate) fn clear_approvals(token_id: &str) {
    let mut a = approvals_of(token_id);
    if a.accounts.is_empty() {
        return;
    }
    a.accounts.clear();
    save_approvals(token_id, a);
}

#[allow(dead_code)]
#[ext_contract(ext_approval_receiver)]
pub trait NonFungibleTokenApprovalReceiver {
    fn nft_on_approve(&mut self, token_id: String, owner_id: AccountId, approval_id: u64, msg: String);
}
const GAS_NFT_RESOLVE: Gas = Gas::from_tgas(15);

pub(crate) fn emit_mint(owner: &AccountId, token_id: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":owner,"token_ids":[token_id]}]})
    ));
}

pub(crate) fn emit_transfer(from: &AccountId, to: &AccountId, token_id: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"nep171","version":"1.2.0","event":"nft_transfer","data":[{"old_owner_id":from,"new_owner_id":to,"token_ids":[token_id]}]})
    ));
}

#[near(serializers = [json])]
pub struct NftContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub issued_at: Option<String>,
    pub extra: Option<String>,
}

#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: Option<HashMap<AccountId, u64>>,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[allow(dead_code)]
#[ext_contract(ext_nft_receiver)]
pub trait NonFungibleTokenReceiver {
    fn nft_on_transfer(&mut self, sender_id: AccountId, previous_owner_id: AccountId, token_id: String, msg: String) -> PromiseOrValue<bool>;
}

#[allow(dead_code)]
#[ext_contract(ext_nft_resolver)]
pub trait NonFungibleTokenResolver {
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: String) -> bool;
}

impl Alley {
    fn token_of(&self, token_id: &str, b: &BeastData) -> Token {
        Token {
            token_id: token_id.to_string(),
            owner_id: b.owner.clone(),
            metadata: Some(TokenMetadata {
                title: Some(b.name.clone()),
                description: Some(format!(
                    "A handmade Bitty Beast. {} of 9 lives lit. Its own account: {}",
                    b.lives,
                    self.beast_account(token_id)
                )),
                media: Some(b.media.clone()),
                issued_at: Some(b.born_ms.to_string()),
                extra: Some(
                    json!({ "stats": b.stats, "lives": b.lives, "marks": b.marks.len(), "account": self.beast_account(token_id) })
                        .to_string(),
                ),
            }),
            approved_account_ids: Some(approvals_of(token_id).accounts.into_iter().collect()),
        }
    }

    /// Shared transfer path: the owner, or an account the owner approved (NEP-178), moves the Beast.
    /// Blocks wandering Beasts, moves ownership, clears approvals and revokes the old key.
    /// Returns (previous owner, revoke promise).
    fn internal_nft_transfer(&mut self, token_id: &String, receiver_id: &AccountId, approval_id: Option<u64>) -> (AccountId, Promise) {
        let sender = env::predecessor_account_id();
        let mut b = self.get(token_id);
        let owner = b.owner.clone();
        if sender != owner {
            let approved = approvals_of(token_id).accounts.get(&sender).copied();
            require!(approved.is_some(), "Only the owner or an approved account can transfer");
            if let Some(id) = approval_id {
                require!(approved == Some(id), "That approval is out of date");
            }
        }
        require!(&owner != receiver_id, "Already theirs");
        require!(b.wander.is_none(), "Wandering: use adopt");
        require!(b.woken, "Wake the Beast first");
        b.controller = None;
        self.move_owner(token_id, &mut b, &owner, receiver_id);
        self.beasts.insert(token_id.clone(), b);
        let via = if sender == owner { String::new() } else { format!(" through {sender}") };
        self.push_history(
            token_id,
            "transfer",
            format!("Handed from {owner} to {receiver_id}{via}. The old paw print was removed."),
            None,
        );
        let revoke = self.wallet_set_controller(token_id, None);
        (owner, revoke)
    }
}

#[near]
impl Alley {
    #[payable]
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: String, approval_id: Option<u64>, memo: Option<String>) {
        assert_one_yocto();
        let _ = memo;
        let (_, revoke) = self.internal_nft_transfer(&token_id, &receiver_id, approval_id);
        // Scheduled when dropped: the old owner's key is deleted in the next receipt.
        drop(revoke);
    }

    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let _ = memo;
        let sender = env::predecessor_account_id();
        let (owner, revoke) = self.internal_nft_transfer(&token_id, &receiver_id, approval_id);
        drop(revoke);
        ext_nft_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_NFT_ON_TRANSFER)
            .nft_on_transfer(sender, owner.clone(), token_id.clone(), msg)
            .then(
                ext_nft_resolver::ext(env::current_account_id())
                    .with_static_gas(GAS_NFT_RESOLVE)
                    .nft_resolve_transfer(owner, receiver_id, token_id),
            )
            .into()
    }

    /// Returns true if the token was kept by the receiver. On a refund the token goes back, still
    /// with no controller key: the original owner calls `bind_key` again.
    #[private]
    pub fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: String) -> bool {
        let keep = match env::promise_result_checked(0, 16) {
            Ok(bytes) => serde_json::from_slice::<bool>(&bytes).map(|r| !r).unwrap_or(true),
            Err(_) => false,
        };
        if keep {
            return true;
        }
        let mut b = self.get(&token_id);
        if b.owner != receiver_id {
            return true;
        }
        self.move_owner(&token_id, &mut b, &receiver_id, &previous_owner_id);
        self.beasts.insert(token_id.clone(), b);
        self.push_history(&token_id, "transfer", format!("Returned to {previous_owner_id}."), None);
        false
    }

    // ------------------------------------------------------------ NEP-178 approvals

    /// The owner lets `account_id` (e.g. a marketplace) transfer this Beast once. With `msg`, the
    /// account is told through `nft_on_approve`. Attach 0.003 NEAR for storage.
    #[payable]
    pub fn nft_approve(&mut self, token_id: String, account_id: AccountId, msg: Option<String>) -> Option<Promise> {
        require!(env::attached_deposit() >= APPROVAL_DEPOSIT, "Attach 0.003 NEAR for the approval's storage");
        let b = self.get(&token_id);
        require!(env::predecessor_account_id() == b.owner, "Only the owner can approve");
        require!(b.woken && b.wander.is_none(), "Not while asleep or wandering");
        let mut a = approvals_of(&token_id);
        a.next_id += 1;
        let id = a.next_id;
        a.accounts.insert(account_id.clone(), id);
        save_approvals(&token_id, a);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"nep178","version":"1.0.0","event":"nft_approve","data":[{"token_id":token_id,"account_id":account_id,"approval_id":id}]})
        ));
        msg.map(|m| ext_approval_receiver::ext(account_id).with_static_gas(GAS_NFT_ON_APPROVE).nft_on_approve(token_id, b.owner, id, m))
    }

    #[payable]
    pub fn nft_revoke(&mut self, token_id: String, account_id: AccountId) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.get(&token_id).owner, "Only the owner can revoke");
        let mut a = approvals_of(&token_id);
        a.accounts.remove(&account_id);
        save_approvals(&token_id, a);
    }

    #[payable]
    pub fn nft_revoke_all(&mut self, token_id: String) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.get(&token_id).owner, "Only the owner can revoke");
        clear_approvals(&token_id);
    }

    pub fn nft_is_approved(&self, token_id: String, approved_account_id: AccountId, approval_id: Option<u64>) -> bool {
        match approvals_of(&token_id).accounts.get(&approved_account_id) {
            None => false,
            Some(id) => approval_id.map(|want| want == *id).unwrap_or(true),
        }
    }

    pub fn nft_token(&self, token_id: String) -> Option<Token> {
        self.beasts.get(&token_id).map(|b| self.token_of(&token_id, b))
    }

    pub fn nft_metadata(&self) -> NftContractMetadata {
        NftContractMetadata {
            spec: "nft-1.0.0".into(),
            name: "Bitty Beasts".into(),
            symbol: "BEAST".into(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.beasts.len() as u128)
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.beasts
            .iter()
            .skip(from_index.map(|f| f.0 as usize).unwrap_or(0))
            .take(limit.unwrap_or(50).min(100) as usize)
            .map(|(id, b)| self.token_of(id, b))
            .collect()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.owner_tokens.get(&account_id).map(|v| v.len()).unwrap_or(0) as u128)
    }

    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.owner_tokens
            .get(&account_id)
            .map(|ids| {
                ids.iter()
                    .skip(from_index.map(|f| f.0 as usize).unwrap_or(0))
                    .take(limit.unwrap_or(50).min(100) as usize)
                    .filter_map(|id| self.nft_token(id.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// NEP-199: the maker earns `ROYALTY_BPS` of every resale.
    pub fn nft_payout(&self, token_id: String, balance: U128, max_len_payout: Option<u32>) -> Payout {
        let b = self.get(&token_id);
        require!(max_len_payout.unwrap_or(2) >= 2, "Payout needs 2 entries");
        let royalty = balance.0 * ROYALTY_BPS / 10_000;
        let mut payout = HashMap::new();
        payout.insert(self.studio.clone(), U128(royalty));
        let owner_share = payout.entry(b.owner.clone()).or_insert(U128(0));
        owner_share.0 += balance.0 - royalty;
        Payout { payout }
    }

    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        let payout = self.nft_payout(token_id.clone(), balance, max_len_payout);
        self.nft_transfer(receiver_id, token_id, approval_id, memo);
        payout
    }
}
