//! $YARN: the alley's money, and the alley's nine lives (NEP-141).
//!
//! The mechanic lives here, in the contract, with no admin and no backend:
//! - Each night, every Bitty Beast may tug the yarn once (by booping its keychain or finishing a
//!   prowl). Only the alley contract can report a tug, and the alley only does so for a real Beast.
//! - When a night ends, anyone can call `settle()`. If at least 60% of registered Beasts tugged,
//!   every Beast that tugged gets 10 YARN and the streak grows. If not, the alley loses one of its
//!   nine lives and 5% of the treasury burns.
//! - Every 7 good nights in a row, one lost life comes back (up to 9).
//! - When all nine lives are gone, the streak resets to zero and the lives refill.
//! - The longest streak ever is The Longest Night. Breaking it starts the Moon Festival next night.
//!
//! All parameters are compile-time constants (see `params()`); `night_ms`, the alley and the genesis
//! allocation are set once in `new`. There is no owner field and no method that changes them. After
//! deployment the account's full-access key is deleted (scripts/deploy.ts), so the code cannot be
//! replaced either.
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

// ---------------------------------------------------------------- parameters (fixed forever)

/// Share of registered Beasts that must tug in one night, in basis points.
pub const TARGET_BPS: u32 = 6_000;
/// YARN minted to each Beast that tugged on a night that hit the target.
pub const MINT_PER_TUG: u128 = 10;
/// Share of the treasury burned when a night misses, in basis points.
pub const BURN_BPS: u128 = 500;
/// The alley's lives.
pub const MAX_LIVES: u8 = 9;
/// Consecutive good nights needed to win one life back.
pub const REGEN_EVERY: u32 = 7;
/// Genesis: treasury (this contract's own balance).
pub const GENESIS_TREASURY: u128 = 10_000;
/// Genesis: each merchant's starting purse.
pub const GENESIS_PER_MERCHANT: u128 = 2_000;
/// At most this many past nights are settled per call (keeps gas bounded).
const MAX_SETTLE_PER_CALL: u64 = 30;
/// At most this many tugs per night (gas bound for the mint loop).
const MAX_TUGS_PER_NIGHT: u32 = 400;

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Token,
    Tugs,
    Tugged,
    Registered,
    Log,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LogEntry {
    pub night: u64,
    /// "mint" | "burn" | "life_lost" | "life_back" | "reset" | "record"
    pub kind: String,
    pub amount: U128,
    pub accounts: u32,
    pub at_ms: u64,
}

#[near(serializers = [json])]
pub struct Params {
    pub target_bps: u32,
    pub mint_per_tug: U128,
    pub burn_bps: u32,
    pub max_lives: u8,
    pub regen_every: u32,
    pub night_ms: u64,
    pub genesis_ms: u64,
    pub alley: AccountId,
    pub admin: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct State {
    pub night: u64,
    pub night_ends_ms: u64,
    pub settled_through: u64,
    pub streak: u32,
    pub longest: u32,
    pub lives: u8,
    pub run: u32,
    pub tugs_tonight: u32,
    pub target_tonight: u32,
    pub registered_beasts: u32,
    pub treasury: U128,
    pub total_supply: U128,
    pub festival: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Yarn {
    token: FungibleToken,
    alley: AccountId,
    night_ms: u64,
    genesis_ms: u64,
    /// Nights strictly below this index are settled.
    settled_through: u64,
    streak: u32,
    longest: u32,
    /// The Longest Night as it stood when the current streak began. The festival fires once,
    /// on the night the streak first passes it.
    record: u32,
    lives: u8,
    run: u32,
    registered_beasts: u32,
    festival_night: Option<u64>,
    /// night -> Beasts that tugged that night
    tugs: LookupMap<u64, Vec<AccountId>>,
    tugged: LookupSet<String>,
    /// night -> registered Beasts reported during that night
    registered_at: LookupMap<u64, u32>,
    log: Vector<LogEntry>,
}

#[near]
impl Yarn {
    #[init]
    pub fn new(alley: AccountId, night_ms: u64, merchants: Vec<AccountId>) -> Self {
        require!(night_ms >= 60_000, "A night is at least one minute");
        require!(merchants.len() <= 8, "At most 8 merchants");
        let now = env::block_timestamp_ms();
        let mut this = Self {
            token: FungibleToken::new(Key::Token),
            alley: alley.clone(),
            night_ms,
            genesis_ms: now,
            settled_through: 0,
            streak: 0,
            longest: 0,
            record: 0,
            lives: MAX_LIVES,
            run: 0,
            registered_beasts: 0,
            festival_night: None,
            tugs: LookupMap::new(Key::Tugs),
            tugged: LookupSet::new(Key::Tugged),
            registered_at: LookupMap::new(Key::Registered),
            log: Vector::new(Key::Log),
        };
        let me = env::current_account_id();
        // Genesis holders (treasury, alley, merchants) are registered here, at deploy time.
        this.token.internal_register_account(&me);
        this.token.internal_register_account(&alley);
        this.token.internal_deposit(&me, GENESIS_TREASURY);
        FtMint { owner_id: &me, amount: U128(GENESIS_TREASURY), memo: Some("genesis: treasury") }.emit();
        for m in merchants.iter() {
            this.token.internal_register_account(m);
            this.token.internal_deposit(m, GENESIS_PER_MERCHANT);
            FtMint { owner_id: m, amount: U128(GENESIS_PER_MERCHANT), memo: Some("genesis: merchant purse") }.emit();
        }
        this
    }

    // ------------------------------------------------------------ the ritual

    /// Records one Beast's tug for tonight. Only the alley can call this, and it does so only for a
    /// woken Bitty Beast (one tug per handmade keychain). Returns false if the Beast already tugged.
    pub fn tug(&mut self, beast_account: AccountId, registered_beasts: u32) -> bool {
        require!(env::predecessor_account_id() == self.alley, "Only the alley can tug the yarn");
        self.settle();
        let night = self.current_night();
        self.registered_beasts = registered_beasts;
        self.registered_at.insert(night, registered_beasts);
        let key = format!("{night}:{beast_account}");
        if self.tugged.contains(&key) {
            return false;
        }
        let list = self.tugs.entry(night).or_insert_with(Vec::new);
        if list.len() as u32 >= MAX_TUGS_PER_NIGHT {
            return false;
        }
        list.push(beast_account.clone());
        self.tugged.insert(key);
        self.register(&beast_account);
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"yarn\",\"version\":\"1.0.0\",\"event\":\"tug\",\"data\":[{{\"night\":{night},\"beast\":\"{beast_account}\"}}]}}"
        ));
        true
    }

    /// Settles every night that has ended. Anyone can call it, any time.
    pub fn settle(&mut self) -> u64 {
        let now_night = self.current_night();
        let mut settled = 0;
        while self.settled_through < now_night && settled < MAX_SETTLE_PER_CALL {
            let n = self.settled_through;
            self.settle_night(n);
            self.settled_through += 1;
            settled += 1;
        }
        settled
    }

    // ------------------------------------------------------------ views

    pub fn params(&self) -> Params {
        Params {
            target_bps: TARGET_BPS,
            mint_per_tug: U128(MINT_PER_TUG),
            burn_bps: BURN_BPS as u32,
            max_lives: MAX_LIVES,
            regen_every: REGEN_EVERY,
            night_ms: self.night_ms,
            genesis_ms: self.genesis_ms,
            alley: self.alley.clone(),
            admin: None,
        }
    }

    /// Live state. Nights that ended but were not settled yet are shown as pending via
    /// `settled_through < night`; call `settle()` to apply them.
    pub fn state(&self) -> State {
        let night = self.current_night();
        let tugs_tonight = self.tugs.get(&night).map(|v| v.len() as u32).unwrap_or(0);
        let registered = self.registered_at.get(&night).copied().unwrap_or(self.registered_beasts);
        State {
            night,
            night_ends_ms: self.genesis_ms + (night + 1) * self.night_ms,
            settled_through: self.settled_through,
            streak: self.streak,
            longest: self.longest,
            lives: self.lives,
            run: self.run,
            tugs_tonight,
            target_tonight: target_for(registered),
            registered_beasts: registered,
            treasury: U128(self.token.internal_unwrap_balance_of(&env::current_account_id())),
            total_supply: U128(self.token.total_supply),
            festival: self.festival_night == Some(night),
        }
    }

    pub fn log(&self, from: Option<u32>, limit: Option<u32>) -> Vec<LogEntry> {
        let from = from.unwrap_or(0);
        let limit = limit.unwrap_or(100).min(500);
        (from..self.log.len().min(from.saturating_add(limit)))
            .filter_map(|i| self.log.get(i).cloned())
            .collect()
    }

    pub fn log_len(&self) -> u32 {
        self.log.len()
    }

    pub fn tugged_tonight(&self, beast_account: AccountId) -> bool {
        self.tugged.contains(&format!("{}:{}", self.current_night(), beast_account))
    }
}

// ---------------------------------------------------------------- internals

fn target_for(registered: u32) -> u32 {
    if registered == 0 {
        return 0;
    }
    ((registered as u64 * TARGET_BPS as u64).div_ceil(10_000)) as u32
}

impl Yarn {
    fn current_night(&self) -> u64 {
        (env::block_timestamp_ms().saturating_sub(self.genesis_ms)) / self.night_ms
    }

    /// The contract pays storage only for the alley and its Beast accounts (`<token>.<alley>`), which
    /// it mints to. Anyone else must register first with NEP-145 `storage_deposit`, so nobody can drain
    /// the contract's NEAR by sending dust to thousands of fresh accounts.
    fn register(&mut self, account: &AccountId) {
        if self.token.accounts.contains_key(account) {
            return;
        }
        let ours = account == &self.alley || account.as_str().ends_with(&format!(".{}", self.alley));
        require!(ours, "Receiver is not registered: call storage_deposit for it first");
        self.token.internal_register_account(account);
    }

    fn push_log(&mut self, night: u64, kind: &str, amount: u128, accounts: u32) {
        self.log.push(LogEntry {
            night,
            kind: kind.to_string(),
            amount: U128(amount),
            accounts,
            at_ms: env::block_timestamp_ms(),
        });
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"yarn\",\"version\":\"1.0.0\",\"event\":\"yarn_night\",\"data\":[{{\"night\":{night},\"kind\":\"{kind}\",\"amount\":\"{amount}\",\"accounts\":{accounts}}}]}}"
        ));
    }

    fn settle_night(&mut self, n: u64) {
        let registered = self.registered_at.get(&n).copied().unwrap_or(self.registered_beasts);
        if registered == 0 {
            return; // no Beasts in the world yet: nothing to win or lose
        }
        let tuggers = self.tugs.remove(&n).unwrap_or_default();
        let target = target_for(registered);
        if tuggers.len() as u32 >= target {
            // A good night: mint to everyone who showed up.
            for b in tuggers.iter() {
                self.token.internal_deposit(b, MINT_PER_TUG);
            }
            let mints: Vec<FtMint> = tuggers
                .iter()
                .map(|b| FtMint { owner_id: b, amount: U128(MINT_PER_TUG), memo: Some("good night") })
                .collect();
            if !mints.is_empty() {
                FtMint::emit_many(&mints);
            }
            self.push_log(n, "mint", MINT_PER_TUG * tuggers.len() as u128, tuggers.len() as u32);
            self.streak += 1;
            self.run += 1;
            if self.run % REGEN_EVERY == 0 && self.lives < MAX_LIVES {
                self.lives += 1;
                self.push_log(n, "life_back", 0, 0);
            }
            if self.streak > self.longest {
                self.longest = self.streak;
            }
            if self.record > 0 && self.streak == self.record + 1 {
                // The Longest Night is broken: the Moon Festival is tomorrow night.
                self.festival_night = Some(n + 1);
                self.push_log(n, "record", self.streak as u128, 0);
            }
        } else {
            // A missed night: the alley loses a life and a slice of the treasury burns.
            let me = env::current_account_id();
            let treasury = self.token.internal_unwrap_balance_of(&me);
            let burn = treasury * BURN_BPS / 10_000;
            if burn > 0 {
                self.token.internal_withdraw(&me, burn);
                FtBurn { owner_id: &me, amount: U128(burn), memo: Some("missed night") }.emit();
            }
            self.push_log(n, "burn", burn, tuggers.len() as u32);
            self.lives = self.lives.saturating_sub(1);
            self.run = 0;
            self.push_log(n, "life_lost", 0, tuggers.len() as u32);
            if self.lives == 0 {
                self.streak = 0;
                self.record = self.longest;
                self.lives = MAX_LIVES;
                self.push_log(n, "reset", 0, 0);
            }
        }
    }
}

// ---------------------------------------------------------------- NEP-141 plumbing

#[near]
impl FungibleTokenCore for Yarn {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.register(&receiver_id);
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.register(&receiver_id);
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Yarn {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Yarn {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Yarn {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Yarn".to_string(),
            symbol: "YARN".to_string(),
            icon: Some(YARN_ICON.to_string()),
            reference: None,
            reference_hash: None,
            decimals: 0,
        }
    }
}

const YARN_ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23e8a33d'/%3E%3Cpath d='M6 12c8 2 14 8 20 14M5 19c7 0 13 3 17 9M10 5c3 7 10 12 18 13' stroke='%23fff3d6' stroke-width='2' fill='none'/%3E%3C/svg%3E";

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NIGHT: u64 = 60_000;

    fn ctx(pred: AccountId, ms: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("yarn.test".parse().unwrap())
            .predecessor_account_id(pred)
            .block_timestamp(ms * 1_000_000)
            .build());
    }

    fn setup() -> Yarn {
        ctx(accounts(0), 0);
        Yarn::new(accounts(1), NIGHT, vec![accounts(2)])
    }

    /// Beast accounts are always sub-accounts of the alley (`<token>.<alley>`).
    fn beast(i: u32) -> AccountId {
        format!("b{i}.{}", accounts(1)).parse().unwrap()
    }

    #[test]
    #[should_panic(expected = "not registered")]
    fn transfers_do_not_pay_storage_for_strangers() {
        let mut y = setup();
        ctx(accounts(2), 1);
        testing_env!(VMContextBuilder::new()
            .current_account_id("yarn.test".parse().unwrap())
            .predecessor_account_id(accounts(2))
            .attached_deposit(near_sdk::NearToken::from_yoctonear(1))
            .build());
        y.ft_transfer("stranger.test".parse().unwrap(), U128(1), None);
    }

    #[test]
    fn transfers_to_beast_accounts_are_registered_for_free() {
        let mut y = setup();
        testing_env!(VMContextBuilder::new()
            .current_account_id("yarn.test".parse().unwrap())
            .predecessor_account_id(accounts(2))
            .attached_deposit(near_sdk::NearToken::from_yoctonear(1))
            .build());
        let cat: AccountId = format!("kit.{}", accounts(1)).parse().unwrap();
        y.ft_transfer(cat.clone(), U128(5), None);
        assert_eq!(y.ft_balance_of(cat).0, 5);
    }

    #[test]
    fn genesis_and_params_are_fixed() {
        let y = setup();
        assert_eq!(y.ft_total_supply().0, GENESIS_TREASURY + GENESIS_PER_MERCHANT);
        assert!(y.params().admin.is_none());
    }

    #[test]
    #[should_panic(expected = "Only the alley")]
    fn only_alley_can_tug() {
        let mut y = setup();
        ctx(accounts(3), 10);
        y.tug(beast(1), 1);
    }

    #[test]
    fn good_night_mints_to_tuggers() {
        let mut y = setup();
        ctx(accounts(1), 10);
        for i in 0..6 {
            assert!(y.tug(beast(i), 10));
        }
        assert!(!y.tug(beast(0), 10), "one tug per Beast per night");
        ctx(accounts(3), NIGHT + 1);
        y.settle();
        assert_eq!(y.ft_balance_of(beast(0)).0, MINT_PER_TUG);
        assert_eq!(y.state().streak, 1);
        assert_eq!(y.state().lives, MAX_LIVES);
    }

    #[test]
    fn missed_night_burns_and_costs_a_life() {
        let mut y = setup();
        ctx(accounts(1), 10);
        for i in 0..5 {
            y.tug(beast(i), 10);
        }
        ctx(accounts(3), NIGHT + 1);
        y.settle();
        let s = y.state();
        assert_eq!(s.lives, MAX_LIVES - 1);
        assert_eq!(s.treasury.0, GENESIS_TREASURY - GENESIS_TREASURY * BURN_BPS / 10_000);
        assert_eq!(y.ft_balance_of(beast(0)).0, 0);
    }

    #[test]
    fn nine_misses_reset_the_streak_and_refill() {
        let mut y = setup();
        ctx(accounts(1), 10);
        y.tug(beast(0), 1); // night 0: good
        ctx(accounts(1), NIGHT + 10);
        y.tug(beast(0), 1); // night 1: good -> streak 2 after settle
        // nights 2..10 empty -> nine misses
        ctx(accounts(3), NIGHT * 11 + 1);
        y.settle();
        let s = y.state();
        assert_eq!(s.longest, 2);
        assert_eq!(s.streak, 0);
        assert_eq!(s.lives, MAX_LIVES);
    }

    #[test]
    fn breaking_the_longest_night_starts_one_festival() {
        let mut y = setup();
        let mut t = 10;
        // streak of 2, then nine misses -> reset with record 2
        for _ in 0..2 {
            ctx(accounts(1), t);
            y.tug(beast(0), 1);
            t += NIGHT;
        }
        t += NIGHT * 9;
        ctx(accounts(3), t);
        y.settle();
        assert_eq!(y.state().streak, 0);
        // three good nights: the third breaks the record of 2
        let mut records = 0;
        for _ in 0..3 {
            ctx(accounts(1), t);
            y.tug(beast(0), 1);
            t += NIGHT;
            ctx(accounts(3), t);
            y.settle();
            records = y.log(None, Some(500)).iter().filter(|e| e.kind == "record").count();
        }
        assert_eq!(records, 1);
        assert!(y.state().festival);
        assert_eq!(y.state().longest, 3);
    }

    #[test]
    fn seven_good_nights_win_a_life_back() {
        let mut y = setup();
        ctx(accounts(1), 10);
        y.tug(beast(0), 1);
        ctx(accounts(3), NIGHT + 1);
        y.settle(); // night 0 good
        ctx(accounts(3), NIGHT * 2 + 1);
        y.settle(); // night 1 missed (registered=1, no tug) -> 8 lives
        assert_eq!(y.state().lives, 8);
        for n in 2..9u64 {
            ctx(accounts(1), NIGHT * n + 10);
            y.tug(beast(0), 1);
        }
        ctx(accounts(3), NIGHT * 9 + 1);
        y.settle();
        assert_eq!(y.state().lives, 9);
        assert_eq!(y.state().run, 7);
    }
}
