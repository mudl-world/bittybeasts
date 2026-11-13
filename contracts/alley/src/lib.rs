//! The Alley: every Bitty Beast (NEP-171), every item (NEP-245), and Lantern Lane.
//!
//! Nine Lives is the one rule here:
//! - A Beast has nine lives (its tail links). A daring fall costs one and leaves a mark; a daily
//!   boop of the real keychain gives one back.
//! - A merchant or a player stall has nine lanterns. An empty till or a missed night's rent costs
//!   one; players revive shops with $YARN.
//! - The alley's own nine lives live in the $YARN contract; this contract reports each Beast's tug.
//!
//! Each Beast token owns a real sub-account, `<token_id>.<this account>`, running the beast-wallet
//! global contract. See docs/ARCHITECTURE.md for how control passes between owners.
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PublicKey,
};
use std::collections::BTreeMap;

mod care;
mod items;
mod market;
mod nft;

pub use care::*;
pub use items::*;
pub use market::*;

// ---------------------------------------------------------------- constants

pub const MAX_LIVES: u8 = 9;
pub const ITEMS: [&str; 11] = [
    "fish", "button", "bell", "moonstone", "charm", "catnip", "lantern", "hat", "scarf", "bow", "glasses",
];
/// NEP-199 royalty to the maker on every resale, in basis points.
pub const ROYALTY_BPS: u128 = 1_000;
/// How long a wandering Beast waits for an adopter.
pub const WANDER_MS: u64 = 72 * 60 * 60 * 1_000;
/// NEAR moved into a new Beast's own account (pays its gas and storage).
pub const BEAST_ACCOUNT_FUNDS: NearToken = NearToken::from_millinear(250);
pub const MIN_REGISTER_DEPOSIT: NearToken = NearToken::from_millinear(300);
const GAS_TUG: Gas = Gas::from_tgas(15);
const GAS_WALLET: Gas = Gas::from_tgas(20);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
pub enum Key {
    Beasts,
    BeastByAccount,
    OwnerTokens,
    History,
    Balances,
    Supply,
    UsedNonces,
    NightStats,
    Care,
    Thoughts,
    Approvals,
}

// ---------------------------------------------------------------- types

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Stats {
    pub reach: u8,
    pub grip: u8,
    pub speed: u8,
    pub luck: u8,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Mark {
    pub kind: String,
    pub note: String,
    pub at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Wander {
    pub seller: AccountId,
    pub price: U128,
    pub until_ms: u64,
    pub nonce: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct BeastData {
    pub owner: AccountId,
    pub name: String,
    pub media: String,
    pub born_ms: u64,
    pub stats: Stats,
    pub lives: u8,
    pub lives_lost_total: u32,
    pub lives_won_total: u32,
    pub marks: Vec<Mark>,
    pub woken: bool,
    pub claim_hash: Vec<u8>,
    pub controller: Option<PublicKey>,
    pub wander: Option<Wander>,
    pub wander_nonce: u32,
    pub last_boop_ms: u64,
    pub best_run: u32,
    pub reputation: BTreeMap<String, i32>,
    pub history_len: u32,
}

#[near(serializers = [json])]
pub struct BeastView {
    pub token_id: String,
    pub owner_id: AccountId,
    pub account_id: AccountId,
    pub name: String,
    pub maker: AccountId,
    pub born_ms: u64,
    pub media: String,
    pub stats: Stats,
    pub lives: u8,
    pub lives_lost_total: u32,
    pub lives_won_total: u32,
    pub legend: bool,
    pub marks: Vec<Mark>,
    pub woken: bool,
    pub controller: Option<PublicKey>,
    pub wander: Option<Wander>,
    pub last_boop_ms: u64,
    pub best_run: u32,
    pub reputation: BTreeMap<String, i32>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct HistoryEntry {
    pub kind: String,
    pub text: String,
    pub at_ms: u64,
    pub owner: AccountId,
    pub yarn: Option<U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct NightStats {
    pub daring_runs: u32,
    pub falls: u32,
    pub safe_runs: u32,
    pub binds: u32,
    pub whips_on_awnings: u32,
    pub sold: BTreeMap<String, U128>,
    pub tugs: u32,
}

#[near(serializers = [json])]
pub struct NightView {
    pub night: u64,
    pub night_ms: u64,
    pub started_ms: u64,
    pub rent: U128,
    pub closed_through: u64,
    pub registered_beasts: u32,
}

// ---------------------------------------------------------------- contract

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Alley {
    pub(crate) studio: AccountId,
    pub(crate) referee: AccountId,
    pub(crate) yarn: AccountId,
    pub(crate) wallet_code: AccountId,
    pub(crate) night_ms: u64,
    pub(crate) genesis_ms: u64,
    pub(crate) closed_through: u64,
    pub(crate) registered_beasts: u32,
    pub(crate) beasts: IterableMap<String, BeastData>,
    pub(crate) beast_by_account: LookupMap<AccountId, String>,
    pub(crate) owner_tokens: LookupMap<AccountId, Vec<String>>,
    pub(crate) history: LookupMap<String, HistoryEntry>,
    pub(crate) balances: LookupMap<String, u128>,
    pub(crate) supply: LookupMap<String, u128>,
    pub(crate) merchants: Vec<Merchant>,
    pub(crate) stalls: Vec<Option<Stall>>,
    pub(crate) rent: u128,
    pub(crate) used_nonces: LookupMap<String, bool>,
    pub(crate) night_stats: LookupMap<u64, NightStats>,
}

#[near]
impl Alley {
    /// `merchants`: (account, display name, quote-signing public key).
    #[init]
    pub fn new(
        studio: AccountId,
        referee: AccountId,
        yarn: AccountId,
        wallet_code: AccountId,
        night_ms: U64,
        merchants: Vec<(AccountId, String, PublicKey)>,
    ) -> Self {
        let mut this = Self {
            studio,
            referee,
            yarn,
            wallet_code,
            night_ms: night_ms.0,
            genesis_ms: env::block_timestamp_ms(),
            closed_through: 0,
            registered_beasts: 0,
            beasts: IterableMap::new(Key::Beasts),
            beast_by_account: LookupMap::new(Key::BeastByAccount),
            owner_tokens: LookupMap::new(Key::OwnerTokens),
            history: LookupMap::new(Key::History),
            balances: LookupMap::new(Key::Balances),
            supply: LookupMap::new(Key::Supply),
            merchants: Vec::new(),
            stalls: (0..STALL_SLOTS).map(|_| None).collect(),
            rent: BASE_RENT,
            used_nonces: LookupMap::new(Key::UsedNonces),
            night_stats: LookupMap::new(Key::NightStats),
        };
        for (account, name, pk) in merchants {
            this.merchants.push(Merchant::new(account, name, pk));
        }
        this.genesis_stock();
        this
    }

    // ------------------------------------------------------------ the studio registers a piece

    /// The artist registers a finished keychain. Creates the Beast's own account (running the
    /// beast-wallet global contract) and mints the token to the studio. `claim_hash` is the hex
    /// sha256 of the secret printed on the keychain's QR card / NFC tag.
    #[payable]
    pub fn register_beast(&mut self, token_id: String, name: String, media: String, stats: Stats, claim_hash: String) -> Promise {
        require!(env::predecessor_account_id() == self.studio, "Only the studio registers Beasts");
        require!(env::attached_deposit() >= MIN_REGISTER_DEPOSIT, "Attach at least 0.3 NEAR");
        require!(
            !token_id.is_empty()
                && token_id.len() <= 24
                && token_id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
            "token_id: lowercase letters, digits and '-' only"
        );
        require!(!self.beasts.contains_key(&token_id), "Token exists");
        require!(name.len() <= 40 && media.len() <= 200, "Name or media too long");
        for s in [stats.reach, stats.grip, stats.speed, stats.luck] {
            require!((1..=10).contains(&s), "Stats are 1..10");
        }
        let hash = hex_decode(&claim_hash);
        require!(hash.len() == 32, "claim_hash must be 32 bytes hex");

        let account = self.beast_account(&token_id);
        let now = env::block_timestamp_ms();
        let studio = self.studio.clone();
        self.beasts.insert(
            token_id.clone(),
            BeastData {
                owner: studio.clone(),
                name: name.clone(),
                media,
                born_ms: now,
                stats,
                lives: MAX_LIVES,
                lives_lost_total: 0,
                lives_won_total: 0,
                marks: vec![],
                woken: false,
                claim_hash: hash,
                controller: None,
                wander: None,
                wander_nonce: 0,
                last_boop_ms: 0,
                best_run: 0,
                reputation: BTreeMap::new(),
                history_len: 0,
            },
        );
        self.beast_by_account.insert(account.clone(), token_id.clone());
        self.add_owner_token(&studio, &token_id);
        self.push_history(&token_id, "born", format!("{name} was shaped and glazed by hand at {studio}."), None);
        nft::emit_mint(&studio, &token_id);

        Promise::new(account)
            .create_account()
            .transfer(BEAST_ACCOUNT_FUNDS)
            .use_global_contract_by_account_id(self.wallet_code.clone())
            .function_call(
                "new".to_string(),
                near_sdk::borsh::to_vec(&(env::current_account_id(), self.yarn.clone())).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            )
    }

    // ------------------------------------------------------------ keychain

    /// First scan of a keychain: the scanner adopts the Beast from the studio and binds a key.
    pub fn wake(&mut self, token_id: String, secret: String, controller_pk: PublicKey) -> Promise {
        let caller = env::predecessor_account_id();
        let mut b = self.get(&token_id);
        require!(!b.woken, "This Beast is already awake");
        require!(b.owner == self.studio, "Not with the studio");
        require!(env::sha256(secret.as_bytes()) == b.claim_hash, "That keychain does not match");
        b.woken = true;
        b.lives = MAX_LIVES;
        b.controller = Some(controller_pk.clone());
        let from = b.owner.clone();
        self.move_owner(&token_id, &mut b, &from, &caller);
        self.beasts.insert(token_id.clone(), b);
        self.registered_beasts += 1;
        self.push_history(&token_id, "woke", format!("Woke up in the paws of {caller}. Nine links lit."), None);
        self.wallet_set_controller(&token_id, Some(controller_pk))
    }

    /// The owner binds a new device key (new phone, or after a plain nft_transfer).
    pub fn bind_key(&mut self, token_id: String, controller_pk: PublicKey) -> Promise {
        let mut b = self.get(&token_id);
        require!(env::predecessor_account_id() == b.owner, "Only the owner");
        require!(b.wander.is_none(), "This Beast is wandering");
        b.controller = Some(controller_pk.clone());
        self.beasts.insert(token_id.clone(), b);
        self.push_history(&token_id, "key", "A new paw print was bound to this Beast.".into(), None);
        self.wallet_set_controller(&token_id, Some(controller_pk))
    }

    /// The daily boop: tap the real keychain. One life back, and tonight's tug on the yarn.
    pub fn boop(&mut self, token_id: String, secret: String) -> Promise {
        let mut b = self.get(&token_id);
        require!(env::predecessor_account_id() == b.owner, "Only the owner can boop");
        require!(b.woken && b.wander.is_none(), "Not now");
        require!(env::sha256(secret.as_bytes()) == b.claim_hash, "That keychain does not match");
        let now = env::block_timestamp_ms();
        require!(b.last_boop_ms == 0 || now - b.last_boop_ms >= self.night_ms, "Already booped today");
        b.last_boop_ms = now;
        let mut text = "Boop! ".to_string();
        if b.lives < MAX_LIVES {
            b.lives += 1;
            b.lives_won_total += 1;
            text.push_str(&format!("A link lit up again ({} of 9).", b.lives));
        } else {
            text.push_str("All nine links already glow.");
        }
        self.beasts.insert(token_id.clone(), b);
        self.push_history(&token_id, "boop", text, None);
        self.tug(&token_id)
    }

    // ------------------------------------------------------------ prowls (referee)

    /// Settles a finished prowl. Called by the game server, which watched the run.
    /// Caps the haul by rooftops so a compromised referee key cannot print items.
    #[allow(clippy::too_many_arguments)]
    pub fn settle_run(
        &mut self,
        token_id: String,
        daring: bool,
        rooftops: u32,
        haul: Vec<(String, U128)>,
        fell: bool,
        mark: Option<String>,
        whips_on_awning: BTreeMap<String, u32>,
        binds: u32,
    ) -> PromiseOrValue<bool> {
        require!(env::predecessor_account_id() == self.referee, "Only the referee settles runs");
        let mut b = self.get(&token_id);
        require!(b.woken && b.wander.is_none(), "This Beast cannot prowl now");
        require!(!daring || b.lives > 0, "Resting: safe runs only until a life returns");
        require!(rooftops <= 60, "Too many rooftops");
        let total: u128 = haul.iter().map(|(_, a)| a.0).sum();
        require!(total <= 3 + rooftops as u128 * 3, "Haul too big for that run");
        for (item, _) in haul.iter() {
            require!(ITEMS.contains(&item.as_str()) && !COSMETICS.contains(&item.as_str()), "Unknown item");
            require!(daring || item != "moonstone", "Moonstones only fall on daring runs");
        }
        self.prowl_hunger(&token_id, daring);
        let account = self.beast_account(&token_id);
        let night = self.current_night();
        let mut stats = self.night_stats.get(&night).cloned().unwrap_or_default();
        if daring {
            stats.daring_runs += 1;
        } else {
            stats.safe_runs += 1;
        }
        stats.binds += binds;

        // Reputation: mischief on a merchant's awning vs protecting the lane from thieves.
        for (m, n) in whips_on_awning.iter() {
            require!(self.merchant_index(m).is_some(), "Unknown merchant");
            let r = b.reputation.entry(m.clone()).or_insert(0);
            *r = (*r - 6 * *n as i32).max(-100);
            stats.whips_on_awnings += n;
        }
        if binds > 0 {
            for m in self.merchants.iter() {
                let r = b.reputation.entry(m.account.to_string()).or_insert(0);
                *r = (*r + 3 * binds as i32).min(100);
            }
        }

        let text;
        if daring && fell {
            stats.falls += 1;
            if self.balance_of("charm", &account) > 0 {
                self.burn("charm", &account, 1);
                text = format!("Fell from rooftop {rooftops}, but the Lucky Charm caught it. Haul lost, life kept.");
            } else {
                b.lives -= 1;
                b.lives_lost_total += 1;
                let kind = mark.unwrap_or_else(|| default_mark(rooftops, b.lives_lost_total));
                b.marks.push(Mark {
                    kind: kind.clone(),
                    note: format!("fell from rooftop {rooftops}"),
                    at_ms: env::block_timestamp_ms(),
                });
                text = format!(
                    "Pushed one rooftop too far (rooftop {rooftops}) and fell. A link went dark ({} of 9) and left a {kind}.",
                    b.lives
                );
            }
        } else {
            let mut got = vec![];
            for (item, amount) in haul.iter() {
                if amount.0 > 0 {
                    self.mint(item, &account, amount.0);
                    got.push(format!("{} {}", amount.0, item));
                }
            }
            if daring && rooftops > b.best_run {
                b.best_run = rooftops;
            }
            let kind = if daring { "Daring" } else { "Safe" };
            text = format!(
                "{kind} run, {rooftops} rooftops: {}{}.",
                if got.is_empty() { "nothing".to_string() } else { got.join(", ") },
                if binds > 0 { format!(", bound {binds} thief(s)") } else { String::new() }
            );
        }
        if b.lives_lost_total >= 9 && b.lives_won_total >= 9 && !is_legend(&b) {
            text_legend(&mut b);
        }
        self.night_stats.insert(night, stats);
        self.beasts.insert(token_id.clone(), b);
        self.push_history(&token_id, "prowl", text, None);
        PromiseOrValue::Promise(self.tug(&token_id))
    }

    // ------------------------------------------------------------ resale: wander, then adopt

    /// "Let it wander": the Beast leaves the seller's control and freezes until adopted.
    #[payable]
    pub fn wander(&mut self, token_id: String, price: U128) -> Promise {
        assert_one_yocto();
        let mut b = self.get(&token_id);
        let seller = env::predecessor_account_id();
        require!(seller == b.owner, "Only the owner");
        require!(b.woken && b.wander.is_none(), "Already wandering");
        b.wander_nonce += 1;
        b.wander = Some(Wander {
            seller: seller.clone(),
            price,
            until_ms: env::block_timestamp_ms() + WANDER_MS,
            nonce: b.wander_nonce,
        });
        self.beasts.insert(token_id.clone(), b);
        self.push_history(
            &token_id,
            "wander",
            format!("Let wander by {seller}, asking {} NEAR.", fmt_near(price.0)),
            None,
        );
        self.set_frozen(&token_id, true)
    }

    #[payable]
    pub fn cancel_wander(&mut self, token_id: String) -> Promise {
        assert_one_yocto();
        let b = self.get(&token_id);
        let w = b.wander.clone().unwrap_or_else(|| env::panic_str("Not wandering"));
        require!(env::predecessor_account_id() == w.seller, "Only the seller");
        self.return_home(&token_id, "Came home to its owner.")
    }

    /// Anyone may send a wandering Beast home once 72 hours have passed.
    pub fn end_wander(&mut self, token_id: String) -> Promise {
        let b = self.get(&token_id);
        let w = b.wander.clone().unwrap_or_else(|| env::panic_str("Not wandering"));
        require!(env::block_timestamp_ms() >= w.until_ms, "Still waiting for an adopter");
        self.return_home(&token_id, "Nobody adopted it in 72 hours; it went home.")
    }

    /// The buyer taps the real keychain and adopts. Pays the seller, pays the maker's royalty,
    /// takes the NFT, and becomes the only key on the Beast's account.
    #[payable]
    pub fn adopt(&mut self, token_id: String, secret: String, controller_pk: PublicKey) -> Promise {
        let buyer = env::predecessor_account_id();
        let mut b = self.get(&token_id);
        let w = b.wander.clone().unwrap_or_else(|| env::panic_str("This Beast is not wandering"));
        require!(buyer != w.seller, "The seller cannot adopt their own Beast");
        require!(env::block_timestamp_ms() < w.until_ms, "This wander has ended");
        require!(env::sha256(secret.as_bytes()) == b.claim_hash, "Tap the real keychain to adopt");
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= w.price.0, "Pay the asking price");

        let royalty = w.price.0 * ROYALTY_BPS / 10_000;
        let to_seller = w.price.0 - royalty;
        let refund = paid - w.price.0;

        let seller = w.seller.clone();
        b.wander = None;
        b.controller = Some(controller_pk.clone());
        self.move_owner(&token_id, &mut b, &seller, &buyer);
        self.beasts.insert(token_id.clone(), b);
        self.push_history(
            &token_id,
            "adopt",
            format!(
                "Adopted by {buyer} for {} NEAR. {} NEAR royalty to its maker.",
                fmt_near(w.price.0),
                fmt_near(royalty)
            ),
            None,
        );

        // The new owner goes to the Beast's own account too, so its nft_item_info answer matches
        // the collection's nft_token the moment the adoption lands.
        let new_owner = self.beasts.get(&token_id).map(|b| b.owner.clone());
        let p = self
            .wallet(&token_id)
            .function_call(
                "set_owner".to_string(),
                near_sdk::borsh::to_vec(&new_owner).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            )
            .function_call(
                "set_controller".to_string(),
                near_sdk::borsh::to_vec(&Some(controller_pk)).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            )
            .function_call(
                "set_frozen".to_string(),
                near_sdk::borsh::to_vec(&false).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            );
        // Payments are independent receipts (a joint promise cannot be returned).
        if to_seller > 0 {
            drop(Promise::new(seller).transfer(NearToken::from_yoctonear(to_seller)));
        }
        if royalty > 0 {
            drop(Promise::new(self.studio.clone()).transfer(NearToken::from_yoctonear(royalty)));
        }
        if refund > 0 {
            drop(Promise::new(buyer).transfer(NearToken::from_yoctonear(refund)));
        }
        p
    }

    // ------------------------------------------------------------ views

    pub fn beast(&self, token_id: String) -> Option<BeastView> {
        self.beasts.get(&token_id).map(|b| self.view_of(&token_id, b))
    }

    pub fn beasts(&self, from: Option<u32>, limit: Option<u32>) -> Vec<BeastView> {
        self.beasts
            .iter()
            .skip(from.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .map(|(id, b)| self.view_of(id, b))
            .collect()
    }

    pub fn beasts_for_owner(&self, account_id: AccountId) -> Vec<BeastView> {
        self.owner_tokens
            .get(&account_id)
            .map(|ids| ids.iter().filter_map(|id| self.beast(id.clone())).collect())
            .unwrap_or_default()
    }

    pub fn beast_for_account(&self, account_id: AccountId) -> Option<BeastView> {
        self.beast_by_account.get(&account_id).and_then(|id| self.beast(id.clone()))
    }

    pub fn history(&self, token_id: String, from: Option<u32>, limit: Option<u32>) -> Vec<HistoryEntry> {
        let len = self.beasts.get(&token_id).map(|b| b.history_len).unwrap_or(0);
        let from = from.unwrap_or(0);
        let end = len.min(from.saturating_add(limit.unwrap_or(100).min(200)));
        (from..end).filter_map(|i| self.history.get(&format!("{token_id}:{i}")).cloned()).collect()
    }

    pub fn night(&self) -> NightView {
        NightView {
            night: self.current_night(),
            night_ms: self.night_ms,
            started_ms: self.genesis_ms + self.current_night() * self.night_ms,
            rent: U128(self.rent),
            closed_through: self.closed_through,
            registered_beasts: self.registered_beasts,
        }
    }

    pub fn night_stats(&self, night: u64) -> NightStats {
        self.night_stats.get(&night).cloned().unwrap_or_default()
    }

    pub fn config(&self) -> serde_json::Value {
        json!({
            "studio": self.studio, "referee": self.referee, "yarn": self.yarn,
            "wallet_code": self.wallet_code, "night_ms": self.night_ms, "royalty_bps": ROYALTY_BPS as u64,
            "stall_slots": STALL_SLOTS, "revive_cost": REVIVE_COST.to_string(), "market_fee_bps": MARKET_FEE_BPS as u64,
        })
    }
}

// ---------------------------------------------------------------- internals

impl Alley {
    pub(crate) fn get(&self, token_id: &String) -> BeastData {
        self.beasts.get(token_id).cloned().unwrap_or_else(|| env::panic_str("No such Beast"))
    }

    pub(crate) fn beast_account(&self, token_id: &str) -> AccountId {
        format!("{token_id}.{}", env::current_account_id()).parse().unwrap()
    }

    pub(crate) fn wallet(&self, token_id: &str) -> Promise {
        Promise::new(self.beast_account(token_id))
    }

    pub(crate) fn current_night(&self) -> u64 {
        env::block_timestamp_ms().saturating_sub(self.genesis_ms) / self.night_ms
    }

    pub(crate) fn token_for_account(&self, account: &AccountId) -> Option<String> {
        self.beast_by_account.get(account).cloned()
    }

    /// Borsh args: the beast-wallet carries no JSON parser.
    ///
    /// The owner is pushed in the same batch as the key, so the Beast's own `nft_item_info` answer
    /// reports the state that governs it rather than a cached copy (sharded-item-1.0.0, req. 4).
    pub(crate) fn wallet_set_controller(&self, token_id: &str, pk: Option<PublicKey>) -> Promise {
        let owner = self.beasts.get(token_id).map(|b| b.owner.clone());
        self.wallet(token_id)
            .function_call(
                "set_owner".to_string(),
                near_sdk::borsh::to_vec(&owner).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            )
            .function_call(
                "set_controller".to_string(),
                near_sdk::borsh::to_vec(&pk).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_WALLET,
            )
    }

    fn set_frozen(&self, token_id: &str, frozen: bool) -> Promise {
        self.wallet(token_id).function_call(
            "set_frozen".to_string(),
            near_sdk::borsh::to_vec(&frozen).unwrap(),
            NearToken::from_yoctonear(0),
            GAS_WALLET,
        )
    }

    fn return_home(&mut self, token_id: &String, text: &str) -> Promise {
        let mut b = self.get(token_id);
        b.wander = None;
        self.beasts.insert(token_id.clone(), b);
        self.push_history(token_id, "home", text.to_string(), None);
        self.set_frozen(token_id, false)
    }

    pub(crate) fn tug(&mut self, token_id: &str) -> Promise {
        let night = self.current_night();
        let mut s = self.night_stats.get(&night).cloned().unwrap_or_default();
        s.tugs += 1;
        self.night_stats.insert(night, s);
        Promise::new(self.yarn.clone()).function_call(
            "tug".to_string(),
            json!({ "beast_account": self.beast_account(token_id), "registered_beasts": self.registered_beasts })
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(0),
            GAS_TUG,
        )
    }

    pub(crate) fn ft_transfer(&self, to: AccountId, amount: u128, memo: &str) -> Promise {
        Promise::new(self.yarn.clone()).function_call(
            "ft_transfer".to_string(),
            json!({ "receiver_id": to, "amount": U128(amount), "memo": memo }).to_string().into_bytes(),
            NearToken::from_yoctonear(1),
            GAS_FT_TRANSFER,
        )
    }

    pub(crate) fn push_history(&mut self, token_id: &str, kind: &str, text: String, yarn: Option<u128>) {
        let mut b = self.get(&token_id.to_string());
        let i = b.history_len;
        self.history.insert(
            format!("{token_id}:{i}"),
            HistoryEntry {
                kind: kind.to_string(),
                text,
                at_ms: env::block_timestamp_ms(),
                owner: b.owner.clone(),
                yarn: yarn.map(U128),
            },
        );
        b.history_len += 1;
        self.beasts.insert(token_id.to_string(), b);
    }

    pub(crate) fn add_owner_token(&mut self, owner: &AccountId, token_id: &str) {
        let list = self.owner_tokens.entry(owner.clone()).or_insert_with(Vec::new);
        if !list.iter().any(|t| t == token_id) {
            list.push(token_id.to_string());
        }
    }

    pub(crate) fn remove_owner_token(&mut self, owner: &AccountId, token_id: &str) {
        if let Some(list) = self.owner_tokens.get_mut(owner) {
            list.retain(|t| t != token_id);
        }
    }

    /// Moves NFT ownership and logs NEP-171 + history. Caller stores `b` afterwards.
    pub(crate) fn move_owner(&mut self, token_id: &str, b: &mut BeastData, from: &AccountId, to: &AccountId) {
        nft::clear_approvals(token_id);
        self.remove_owner_token(from, token_id);
        self.add_owner_token(to, token_id);
        b.owner = to.clone();
        nft::emit_transfer(from, to, token_id);
    }

    fn view_of(&self, token_id: &str, b: &BeastData) -> BeastView {
        BeastView {
            token_id: token_id.to_string(),
            owner_id: b.owner.clone(),
            account_id: self.beast_account(token_id),
            name: b.name.clone(),
            maker: self.studio.clone(),
            born_ms: b.born_ms,
            media: b.media.clone(),
            stats: b.stats.clone(),
            lives: b.lives,
            lives_lost_total: b.lives_lost_total,
            lives_won_total: b.lives_won_total,
            legend: is_legend(b),
            marks: b.marks.clone(),
            woken: b.woken,
            controller: b.controller.clone(),
            wander: b.wander.clone(),
            last_boop_ms: b.last_boop_ms,
            best_run: b.best_run,
            reputation: b.reputation.clone(),
        }
    }
}

fn is_legend(b: &BeastData) -> bool {
    b.lives_lost_total >= 9 && b.lives_won_total >= 9
}

fn text_legend(b: &mut BeastData) {
    b.marks.push(Mark { kind: "golden-links".into(), note: "Lost and won back nine lives: a Legend".into(), at_ms: env::block_timestamp_ms() });
}

fn default_mark(rooftops: u32, n: u32) -> String {
    let marks = ["scar", "bent-ear", "patch", "chipped-tooth", "kinked-tail", "torn-ear", "notch", "stripe", "freckle"];
    marks[((rooftops + n) as usize) % marks.len()].to_string()
}

pub(crate) fn fmt_near(yocto: u128) -> String {
    let milli = yocto / 10u128.pow(21);
    format!("{}.{:03}", milli / 1000, milli % 1000)
}

pub(crate) fn hex_decode(s: &str) -> Vec<u8> {
    if s.len() % 2 != 0 {
        return vec![];
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap_or_else(|_| env::panic_str("bad hex")))
        .collect()
}

#[cfg(test)]
mod tests;
