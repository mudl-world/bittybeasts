//! Lantern Lane: merchant agents with tills, player stalls, nightly rent, lights-out and revival.
//!
//! Merchants are AI agents running off-chain (app/api/merchant, lib/economy/pricing.ts). They hold
//! their own NEAR accounts and keys. A price only counts if the merchant signed it: every trade
//! here checks the merchant's ed25519 signature on the quote, so the contract enforces the deal
//! while the agent decides the price.
use crate::*;

pub const STALL_SLOTS: u32 = 12;
pub const BASE_RENT: u128 = 5;
pub const MIN_RENT: u128 = 2;
pub const MAX_RENT: u128 = 50;
/// A till below this at night's close counts as empty: the shop loses a lantern and goes dark.
pub const EMPTY_TILL: u128 = 5;
/// $YARN needed in the till to relight a dark shop.
pub const REVIVE_COST: u128 = 200;
/// 2% market fee to the $YARN treasury.
pub const MARKET_FEE_BPS: u128 = 200;
const MAX_NIGHTS_PER_CLOSE: u64 = 10;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Merchant {
    pub account: AccountId,
    pub name: String,
    pub key: PublicKey,
    pub till: U128,
    pub lanterns: u8,
    pub open: bool,
    pub retired: bool,
    pub sold_tonight: BTreeMap<String, U128>,
    pub bought_tonight: BTreeMap<String, U128>,
    pub invested: U128,
}

impl Merchant {
    pub fn new(account: AccountId, name: String, key: PublicKey) -> Self {
        Self {
            account,
            name,
            key,
            till: U128(0),
            lanterns: MAX_LIVES,
            open: true,
            retired: false,
            sold_tonight: BTreeMap::new(),
            bought_tonight: BTreeMap::new(),
            invested: U128(0),
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct StallRules {
    /// Lowest price per item the Beast will accept.
    pub floors: BTreeMap<String, U128>,
    /// Items the Beast never sells.
    pub never_sell: Vec<String>,
    /// Off-chain agent hints: buy below these prices, up to `nightly_budget` per night.
    pub buy_below: Option<BTreeMap<String, U128>>,
    pub nightly_budget: Option<U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Stall {
    pub token_id: String,
    pub beast_account: AccountId,
    pub lanterns: u8,
    pub rent_paid: U128,
    pub rules: StallRules,
    pub opened_ms: u64,
    pub sales: u32,
}

#[near(serializers = [json])]
pub struct StallView {
    pub slot: u32,
    pub token_id: Option<String>,
    pub beast_account: Option<AccountId>,
    pub name: Option<String>,
    pub lanterns: u8,
    pub rent_paid: U128,
    pub rules: Option<StallRules>,
    pub stock: BTreeMap<String, U128>,
    pub sales: u32,
}

#[near(serializers = [json])]
pub struct MerchantView {
    pub account_id: AccountId,
    pub name: String,
    pub till: U128,
    pub lanterns: u8,
    pub open: bool,
    pub retired: bool,
    pub inventory: BTreeMap<String, U128>,
    pub sold_tonight: BTreeMap<String, U128>,
    pub bought_tonight: BTreeMap<String, U128>,
    pub invested: U128,
}

/// A price quote signed by a merchant agent. Field order is the signed byte order.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Quote {
    pub merchant: AccountId,
    pub beast: AccountId,
    /// "sell": the Beast sells to the merchant. "buy": the Beast buys from the merchant.
    pub side: String,
    pub item: String,
    pub amount: U128,
    pub price_per: U128,
    pub expires_ms: u64,
    pub nonce: u64,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum PayMsg {
    Till {},
    Rent {},
    BuyMerchant { quote: Quote, signature: Base64VecU8 },
    BuyStall { slot: u32, item: String, amount: U128, price_per: U128 },
    Revive { target: String },
    Think {},
}

fn add(map: &mut BTreeMap<String, U128>, k: &str, v: u128) {
    let e = map.entry(k.to_string()).or_insert(U128(0));
    e.0 += v;
}

fn fee(total: u128) -> u128 {
    total * MARKET_FEE_BPS / 10_000
}

impl Alley {
    pub(crate) fn merchant_index(&self, account: &str) -> Option<usize> {
        self.merchants.iter().position(|m| m.account.as_str() == account)
    }

    /// Fixed starting shelves so every merchant has something to sell on night one.
    pub(crate) fn genesis_stock(&mut self) {
        let stock: [(&str, &str, u128); 7] = [
            ("tom", "fish", 18),
            ("miso", "button", 22),
            ("bandit", "bell", 8),
            ("bandit", "moonstone", 3),
            ("clove", "charm", 8),
            ("clove", "catnip", 16),
            ("clove", "lantern", 6),
        ];
        let accounts: Vec<AccountId> = self.merchants.iter().map(|m| m.account.clone()).collect();
        for (prefix, item, n) in stock {
            if let Some(a) = accounts.iter().find(|a| a.as_str().starts_with(&format!("{prefix}."))) {
                self.mint(item, a, n);
            }
        }
        self.stock_miso_wardrobe();
    }

    fn verify_quote(&mut self, quote: &Quote, signature: &[u8], side: &str) -> usize {
        require!(quote.side == side, "Wrong side");
        require!(env::block_timestamp_ms() <= quote.expires_ms, "Quote expired; ask again");
        require!(ITEMS.contains(&quote.item.as_str()), "Unknown item");
        require!(quote.amount.0 > 0 && quote.price_per.0 > 0, "Nothing to trade");
        let i = self.merchant_index(quote.merchant.as_str()).unwrap_or_else(|| env::panic_str("Unknown merchant"));
        let m = &self.merchants[i];
        require!(m.open, format!("{} has the lights out", m.name));
        let msg = serde_json::to_string(quote).unwrap();
        let key = m.key.as_bytes();
        require!(key.len() == 33 && key[0] == 0, "Merchant key must be ed25519");
        let pk: [u8; 32] = key[1..].try_into().unwrap();
        let sig: [u8; 64] = signature.try_into().unwrap_or_else(|_| env::panic_str("Bad signature length"));
        require!(env::ed25519_verify(&sig, msg.as_bytes(), &pk), "The merchant never offered that price");
        let nonce_key = format!("{}:{}", quote.merchant, quote.nonce);
        require!(!self.used_nonces.contains_key(&nonce_key), "Quote already used");
        self.used_nonces.insert(nonce_key, true);
        i
    }

    fn stall_of(&self, beast: &AccountId) -> Option<u32> {
        self.stalls
            .iter()
            .position(|s| s.as_ref().map(|s| &s.beast_account == beast).unwrap_or(false))
            .map(|i| i as u32)
    }

    fn assert_beast_caller(&self) -> (String, AccountId) {
        let caller = env::predecessor_account_id();
        let token = self.token_for_account(&caller).unwrap_or_else(|| env::panic_str("Only a Beast can do this"));
        let b = self.get(&token);
        require!(b.woken && b.wander.is_none(), "This Beast is wandering");
        (token, caller)
    }

    fn handle_payment(&mut self, sender: AccountId, amount: u128, msg: PayMsg) -> (u128, Option<Promise>) {
        match msg {
            PayMsg::Think {} => self.buy_thoughts(&sender, amount),
            PayMsg::Till {} => {
                let i = self.merchant_index(sender.as_str()).unwrap_or_else(|| env::panic_str("Only a merchant fills its till"));
                self.merchants[i].till.0 += amount;
                (0, None)
            }
            PayMsg::Rent {} => {
                let slot = self.stall_of(&sender).unwrap_or_else(|| env::panic_str("No stall for this Beast"));
                let s = self.stalls[slot as usize].as_mut().unwrap();
                s.rent_paid.0 += amount;
                (0, None)
            }
            PayMsg::BuyMerchant { quote, signature } => {
                require!(quote.beast == sender, "Quote is for another Beast");
                let token = self.token_for_account(&sender).unwrap_or_else(|| env::panic_str("Only a Beast can buy here"));
                let i = self.verify_quote(&quote, &signature.0, "buy");
                let total = quote.amount.0 * quote.price_per.0;
                require!(amount >= total, "Not enough YARN sent");
                let merchant = self.merchants[i].account.clone();
                self.move_items(&quote.item, &merchant, &sender, quote.amount.0, Some("bought from merchant"));
                let f = fee(total);
                let m = &mut self.merchants[i];
                m.till.0 += total - f;
                add(&mut m.sold_tonight, &quote.item, quote.amount.0);
                let name = m.name.clone();
                self.push_history(
                    &token,
                    "buy",
                    format!("Bought {} {} from {name} for {total} YARN.", quote.amount.0, quote.item),
                    Some(total),
                );
                (amount - total, (f > 0).then(|| self.ft_transfer(self.yarn.clone(), f, "market fee")))
            }
            PayMsg::BuyStall { slot, item, amount: qty, price_per } => {
                let s = self.stalls.get(slot as usize).cloned().flatten().unwrap_or_else(|| env::panic_str("Empty slot"));
                require!(s.beast_account != sender, "That is your own stall");
                let seller_token = s.token_id.clone();
                let seller = self.get(&seller_token);
                require!(seller.wander.is_none(), "That stall's Beast is wandering");
                require!(!s.rules.never_sell.contains(&item), "Not for sale, ever");
                let floor = s.rules.floors.get(&item).map(|f| f.0).unwrap_or(1);
                require!(price_per.0 >= floor, format!("Below the floor of {floor} YARN"));
                let total = qty.0 * price_per.0;
                require!(amount >= total, "Not enough YARN sent");
                self.move_items(&item, &s.beast_account, &sender, qty.0, Some("bought from stall"));
                let f = fee(total);
                if let Some(st) = self.stalls[slot as usize].as_mut() {
                    st.sales += 1;
                }
                let night = self.current_night();
                let mut ns = self.night_stats.get(&night).cloned().unwrap_or_default();
                add(&mut ns.sold, &item, qty.0);
                self.night_stats.insert(night, ns);
                self.push_history(
                    &seller_token,
                    "receipt",
                    format!(
                        "Stall sold {} {item} to {sender} at {} YARN each (floor {floor}{}).",
                        qty.0,
                        price_per.0,
                        if price_per.0 > floor { ", beat it" } else { "" }
                    ),
                    Some(total - f),
                );
                // Proceeds go to the Beast's own account, never to its owner: they follow the Beast.
                drop(self.ft_transfer(s.beast_account.clone(), total - f, "stall sale"));
                let fee_p = (f > 0).then(|| self.ft_transfer(self.yarn.clone(), f, "market fee"));
                (amount - total, fee_p)
            }
            PayMsg::Revive { target } => {
                if let Some(i) = self.merchant_index(&target) {
                    let m = &mut self.merchants[i];
                    require!(!m.retired, "Retired for good");
                    m.till.0 += amount;
                    m.invested.0 += amount;
                    if !m.open && m.till.0 >= REVIVE_COST {
                        m.open = true;
                        m.lanterns = (m.lanterns + 1).min(MAX_LIVES);
                    }
                } else if let Some(slot) = target.strip_prefix("stall:").and_then(|s| s.parse::<usize>().ok()) {
                    let s = self.stalls.get_mut(slot).and_then(|s| s.as_mut()).unwrap_or_else(|| env::panic_str("Empty slot"));
                    s.rent_paid.0 += amount;
                    if s.lanterns < MAX_LIVES && s.rent_paid.0 >= REVIVE_COST {
                        s.lanterns += 1;
                    }
                } else {
                    env::panic_str("Unknown shop");
                }
                if let Some(token) = self.token_for_account(&sender) {
                    self.push_history(&token, "invest", format!("Put {amount} YARN into reviving {target}."), Some(amount));
                }
                (0, None)
            }
        }
    }
}

#[near]
impl Alley {
    /// NEP-141 receiver: $YARN coming into the lane.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.yarn, "Only $YARN is accepted here");
        let parsed: PayMsg = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Unknown payment message"));
        let (refund, _promise) = self.handle_payment(sender_id, amount.0, parsed);
        PromiseOrValue::Value(U128(refund))
    }

    /// The Beast sells loot to a merchant at the merchant's signed price. Called by the Beast's own
    /// account. Payment goes to the Beast's account (minus the 2% fee to the treasury).
    pub fn sell_to_merchant(&mut self, quote: Quote, signature: Base64VecU8) {
        let (token, beast) = self.assert_beast_caller();
        require!(quote.beast == beast, "Quote is for another Beast");
        let i = self.verify_quote(&quote, &signature.0, "sell");
        let total = quote.amount.0 * quote.price_per.0;
        require!(self.merchants[i].till.0 >= total, format!("{} can't afford that tonight", self.merchants[i].name));
        let merchant = self.merchants[i].account.clone();
        self.move_items(&quote.item, &beast, &merchant, quote.amount.0, Some("sold to merchant"));
        let f = fee(total);
        let m = &mut self.merchants[i];
        m.till.0 -= total;
        add(&mut m.bought_tonight, &quote.item, quote.amount.0);
        let name = m.name.clone();
        let night = self.current_night();
        let mut ns = self.night_stats.get(&night).cloned().unwrap_or_default();
        add(&mut ns.sold, &quote.item, quote.amount.0);
        self.night_stats.insert(night, ns);
        self.push_history(
            &token,
            "sell",
            format!("Sold {} {} to {name} at {} YARN each.", quote.amount.0, quote.item, quote.price_per.0),
            Some(total - f),
        );
        // Two independent receipts (returning a joint promise is not allowed). Payment goes to the
        // Beast's own account, never to its owner, so it follows the Beast through any resale.
        drop(self.ft_transfer(beast, total - f, "sold to merchant"));
        if f > 0 {
            drop(self.ft_transfer(self.yarn.clone(), f, "market fee"));
        }
    }

    pub fn open_stall(&mut self, slot: u32) {
        let (token, beast) = self.assert_beast_caller();
        require!(slot < STALL_SLOTS, "No such slot");
        require!(self.stall_of(&beast).is_none(), "This Beast already runs a stall");
        require!(self.stalls[slot as usize].is_none(), "Slot taken");
        self.stalls[slot as usize] = Some(Stall {
            token_id: token.clone(),
            beast_account: beast,
            lanterns: MAX_LIVES,
            rent_paid: U128(0),
            rules: StallRules::default(),
            opened_ms: env::block_timestamp_ms(),
            sales: 0,
        });
        self.push_history(&token, "stall", format!("Opened stall {slot} on Lantern Lane. Nine lanterns lit."), None);
    }

    pub fn set_stall_rules(&mut self, rules: StallRules) {
        let (token, beast) = self.assert_beast_caller();
        let slot = self.stall_of(&beast).unwrap_or_else(|| env::panic_str("No stall"));
        require!(rules.never_sell.iter().all(|i| ITEMS.contains(&i.as_str())), "Unknown item");
        require!(rules.floors.keys().all(|i| ITEMS.contains(&i.as_str())), "Unknown item");
        self.stalls[slot as usize].as_mut().unwrap().rules = rules;
        self.push_history(&token, "rules", "Updated the stall rules.".into(), None);
    }

    pub fn close_stall(&mut self) -> PromiseOrValue<()> {
        let (token, beast) = self.assert_beast_caller();
        let slot = self.stall_of(&beast).unwrap_or_else(|| env::panic_str("No stall"));
        let s = self.stalls[slot as usize].take().unwrap();
        self.push_history(&token, "stall", format!("Closed stall {slot}."), Some(s.rent_paid.0));
        if s.rent_paid.0 > 0 {
            PromiseOrValue::Promise(self.ft_transfer(beast, s.rent_paid.0, "rent refund"))
        } else {
            PromiseOrValue::Value(())
        }
    }

    /// Closes every finished market night. Anyone can call it.
    /// - Each open merchant with an empty till loses a lantern and goes dark until revived.
    ///   At zero lanterns it retires for good.
    /// - Each stall pays tonight's rent to the $YARN treasury or loses a lantern. At zero the slot
    ///   opens for someone else.
    /// - Rent moves: +10% when every slot is full, -10% when four or more sit empty.
    /// - Sister Clove brews 3 Lucky Charms a night if her lights are on.
    pub fn close_night(&mut self) -> u64 {
        let now = self.current_night();
        let mut closed = 0;
        let mut rent_collected: u128 = 0;
        while self.closed_through < now && closed < MAX_NIGHTS_PER_CLOSE {
            for m in self.merchants.iter_mut() {
                if m.retired {
                    continue;
                }
                if m.open && m.till.0 < EMPTY_TILL {
                    m.lanterns = m.lanterns.saturating_sub(1);
                    m.open = false;
                    if m.lanterns == 0 {
                        m.retired = true;
                    }
                }
                m.sold_tonight.clear();
                m.bought_tonight.clear();
            }
            let clove = self.merchants.iter().find(|m| m.account.as_str().starts_with("clove.") && m.open).map(|m| m.account.clone());
            if let Some(c) = clove {
                self.mint("charm", &c, 3);
            }
            let rent = self.rent;
            let mut freed = vec![];
            for (slot, s) in self.stalls.iter_mut().enumerate() {
                if let Some(st) = s.as_mut() {
                    if st.rent_paid.0 >= rent {
                        st.rent_paid.0 -= rent;
                        rent_collected += rent;
                    } else {
                        st.lanterns = st.lanterns.saturating_sub(1);
                        if st.lanterns == 0 {
                            freed.push(slot);
                        }
                    }
                }
            }
            for slot in freed {
                if let Some(st) = self.stalls[slot].take() {
                    rent_collected += st.rent_paid.0;
                    let token = st.token_id.clone();
                    self.push_history(&token, "stall", format!("Stall {slot} ran out of lanterns. The slot went back to the lane."), None);
                }
            }
            let filled = self.stalls.iter().filter(|s| s.is_some()).count() as u32;
            if filled == STALL_SLOTS {
                self.rent = (self.rent * 11).div_ceil(10).min(MAX_RENT);
            } else if STALL_SLOTS - filled >= 4 {
                self.rent = (self.rent * 9 / 10).max(MIN_RENT);
            }
            self.closed_through += 1;
            closed += 1;
        }
        if rent_collected > 0 {
            // Scheduled when dropped: tonight's rent goes to the $YARN treasury.
            drop(self.ft_transfer(self.yarn.clone(), rent_collected, "stall rent"));
        }
        closed
    }

    pub fn merchants(&self) -> Vec<MerchantView> {
        self.merchants
            .iter()
            .map(|m| MerchantView {
                account_id: m.account.clone(),
                name: m.name.clone(),
                till: m.till,
                lanterns: m.lanterns,
                open: m.open,
                retired: m.retired,
                inventory: ITEMS
                    .iter()
                    .filter_map(|i| {
                        let b = self.balance_of(i, &m.account);
                        (b > 0).then(|| (i.to_string(), U128(b)))
                    })
                    .collect(),
                sold_tonight: m.sold_tonight.clone(),
                bought_tonight: m.bought_tonight.clone(),
                invested: m.invested,
            })
            .collect()
    }

    pub fn merchant_key(&self, account_id: AccountId) -> Option<PublicKey> {
        self.merchant_index(account_id.as_str()).map(|i| self.merchants[i].key.clone())
    }

    pub fn stalls(&self) -> Vec<StallView> {
        self.stalls
            .iter()
            .enumerate()
            .map(|(slot, s)| match s {
                Some(st) => StallView {
                    slot: slot as u32,
                    token_id: Some(st.token_id.clone()),
                    beast_account: Some(st.beast_account.clone()),
                    name: self.beasts.get(&st.token_id).map(|b| b.name.clone()),
                    lanterns: st.lanterns,
                    rent_paid: st.rent_paid,
                    rules: Some(st.rules.clone()),
                    stock: ITEMS
                        .iter()
                        .filter(|i| !st.rules.never_sell.contains(&i.to_string()))
                        .filter_map(|i| {
                            let b = self.balance_of(i, &st.beast_account);
                            (b > 0).then(|| (i.to_string(), U128(b)))
                        })
                        .collect(),
                    sales: st.sales,
                },
                None => StallView {
                    slot: slot as u32,
                    token_id: None,
                    beast_account: None,
                    name: None,
                    lanterns: 0,
                    rent_paid: U128(0),
                    rules: None,
                    stock: BTreeMap::new(),
                    sales: 0,
                },
            })
            .collect()
    }
}
