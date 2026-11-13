//! The cat room: feeding, dressing, a persona, and thoughts the cat pays for itself.
//!
//! - Fullness and happiness (0..100) fall over time. Feeding burns a fish or catnip from the Beast's
//!   own account; dressing equips cosmetics (NEP-245 items) the Beast owns; prowling makes it hungry.
//!   A starving Beast won't go on a daring run.
//! - The Beast's persona (who it is, how it talks) lives here, on chain. The game server builds the
//!   AI prompt only from on-chain data, so anyone can rebuild the request.
//! - Thoughts: the Beast pays YARN from its own account (`{"think":{}}`) for thought credits; the
//!   YARN goes to the $YARN treasury. Each reply from NEAR AI is recorded here by the referee with
//!   the request/response hashes and NEAR AI's TEE signature, and costs one credit.
//!
//! Stored in maps of its own (not in the contract's root struct), so existing state needs no migration.
use crate::*;

pub const COSMETICS: [&str; 4] = ["hat", "scarf", "bow", "glasses"];
pub const FOODS: [&str; 2] = ["fish", "catnip"];
/// YARN per thought credit.
pub const THOUGHT_PRICE: u128 = 1;
/// Fullness drops one point per minute; happiness one point per 90 seconds.
pub const FULLNESS_MS_PER_POINT: u64 = 60_000;
pub const HAPPINESS_MS_PER_POINT: u64 = 90_000;
/// A Beast below this fullness is too hungry for daring runs.
pub const STARVING: u8 = 10;
/// Every prowl costs this much fullness.
pub const PROWL_HUNGER: u8 = 5;
const MAX_PERSONA: usize = 500;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Care {
    pub fullness: u8,
    pub happiness: u8,
    /// When fullness and happiness were last written (they decay from here).
    pub at_ms: u64,
    pub outfit: Vec<String>,
    pub persona: String,
    pub thought_credits: u32,
    pub thoughts: u32,
}

impl Care {
    fn fresh(now: u64) -> Self {
        Self { fullness: 70, happiness: 70, at_ms: now, outfit: vec![], persona: String::new(), thought_credits: 0, thoughts: 0 }
    }

    /// Values as of `now`, after decay.
    fn at(&self, now: u64) -> Self {
        let dt = now.saturating_sub(self.at_ms);
        let mut c = self.clone();
        c.fullness = self.fullness.saturating_sub((dt / FULLNESS_MS_PER_POINT).min(100) as u8);
        c.happiness = self.happiness.saturating_sub((dt / HAPPINESS_MS_PER_POINT).min(100) as u8);
        c.at_ms = now;
        c
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Thought {
    /// What the owner said (as the server received it).
    pub said: String,
    /// What the Beast replied.
    pub reply: String,
    pub model: String,
    /// NEAR AI chat completion id; GET /v1/signature/{chat_id} returns the signature below.
    pub chat_id: String,
    /// sha256 of the exact request and response bodies sent to / received from NEAR AI.
    pub request_hash: String,
    pub response_hash: String,
    /// NEAR AI's signature over "<model>:<request_hash>:<response_hash>" (or the gateway form).
    pub signature: String,
    pub signing_address: String,
    pub signing_algo: String,
    pub at_ms: u64,
}

fn cares() -> LookupMap<String, Care> {
    LookupMap::new(Key::Care)
}

fn thoughts_map() -> LookupMap<String, Thought> {
    LookupMap::new(Key::Thoughts)
}

fn add_capped(v: u8, n: u8) -> u8 {
    v.saturating_add(n).min(100)
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

impl Alley {
    pub(crate) fn care_now(&self, token_id: &str) -> Care {
        let now = env::block_timestamp_ms();
        cares().get(token_id).map(|c| c.at(now)).unwrap_or_else(|| Care::fresh(now))
    }

    pub(crate) fn save_care(&mut self, token_id: &str, care: Care) {
        let mut map = cares();
        map.insert(token_id.to_string(), care);
        map.flush();
    }

    /// Called from settle_run: a prowl makes the Beast hungry, and a starving Beast stays off the high roofs.
    pub(crate) fn prowl_hunger(&mut self, token_id: &str, daring: bool) {
        let mut c = self.care_now(token_id);
        require!(!daring || c.fullness >= STARVING, "Too hungry for a daring run: feed your Beast first");
        c.fullness = c.fullness.saturating_sub(PROWL_HUNGER);
        self.save_care(token_id, c);
    }

    /// YARN in for thought credits (`{"think":{}}`, sent by the Beast's own account). Returns the refund.
    pub(crate) fn buy_thoughts(&mut self, sender: &AccountId, amount: u128) -> (u128, Option<Promise>) {
        let token = self.token_for_account(sender).unwrap_or_else(|| env::panic_str("Only a Beast can buy thoughts"));
        let credits = amount / THOUGHT_PRICE;
        require!(credits > 0 && credits <= 1_000, "Buy between 1 and 1000 thoughts");
        let spent = credits * THOUGHT_PRICE;
        let mut c = self.care_now(&token);
        c.thought_credits += credits as u32;
        self.save_care(&token, c);
        self.push_history(&token, "think", format!("Bought {credits} thought(s) with its own YARN."), Some(spent));
        (amount - spent, Some(self.ft_transfer(self.yarn.clone(), spent, "thoughts")))
    }
}

#[near]
impl Alley {
    /// Feed the Beast one fish (+30 fullness) or one catnip (+10 fullness, +25 happiness).
    /// Called by the Beast's own account; the item is burned from it.
    pub fn feed(&mut self, item: String) {
        let caller = env::predecessor_account_id();
        let token = self.token_for_account(&caller).unwrap_or_else(|| env::panic_str("Only a Beast can eat"));
        require!(FOODS.contains(&item.as_str()), "Beasts eat fish or catnip");
        require!(self.balance_of(&item, &caller) >= 1, format!("No {item} left"));
        self.burn(&item, &caller, 1);
        let mut c = self.care_now(&token);
        if item == "fish" {
            c.fullness = add_capped(c.fullness, 30);
            c.happiness = add_capped(c.happiness, 5);
        } else {
            c.fullness = add_capped(c.fullness, 10);
            c.happiness = add_capped(c.happiness, 25);
        }
        let text = format!("Ate a {item}. Fullness {}, happiness {}.", c.fullness, c.happiness);
        self.save_care(&token, c);
        self.push_history(&token, "feed", text, None);
    }

    /// Wear these cosmetics (each must be owned by the Beast's account). An empty list undresses.
    pub fn dress(&mut self, outfit: Vec<String>) {
        let caller = env::predecessor_account_id();
        let token = self.token_for_account(&caller).unwrap_or_else(|| env::panic_str("Only a Beast can dress"));
        require!(outfit.len() <= COSMETICS.len(), "Too many things to wear");
        for (i, item) in outfit.iter().enumerate() {
            require!(COSMETICS.contains(&item.as_str()), "That isn't something to wear");
            require!(!outfit[..i].contains(item), "Already wearing that");
            require!(self.balance_of(item, &caller) >= 1, format!("Buy a {item} from Miso first"));
        }
        let mut c = self.care_now(&token);
        if c.outfit != outfit {
            c.happiness = add_capped(c.happiness, 15);
        }
        c.outfit = outfit.clone();
        self.save_care(&token, c);
        let text = if outfit.is_empty() { "Took everything off.".to_string() } else { format!("Dressed up: {}.", outfit.join(", ")) };
        self.push_history(&token, "dress", text, None);
    }

    /// Who this Beast is and how it talks. Part of every prompt the game sends to NEAR AI.
    pub fn set_persona(&mut self, persona: String) {
        let caller = env::predecessor_account_id();
        let token = self.token_for_account(&caller).unwrap_or_else(|| env::panic_str("Only a Beast has a persona"));
        require!(persona.len() <= MAX_PERSONA, "Persona too long (500 characters)");
        let mut c = self.care_now(&token);
        c.persona = persona;
        self.save_care(&token, c);
        self.push_history(&token, "persona", "Has a new outlook on life.".into(), None);
    }

    /// The referee records one verified thought from NEAR AI. Costs the Beast one thought credit.
    #[allow(clippy::too_many_arguments)]
    pub fn record_thought(
        &mut self,
        token_id: String,
        said: String,
        reply: String,
        model: String,
        chat_id: String,
        request_hash: String,
        response_hash: String,
        signature: String,
        signing_address: String,
        signing_algo: String,
    ) {
        require!(env::predecessor_account_id() == self.referee, "Only the referee records thoughts");
        let b = self.get(&token_id);
        require!(b.woken && b.wander.is_none(), "This Beast can't talk right now");
        require!(said.len() <= 300 && reply.len() <= 800, "Too long");
        require!(model.len() <= 100 && chat_id.len() <= 100 && signature.len() <= 200 && signing_address.len() <= 100, "Too long");
        require!(is_hex64(&request_hash) && is_hex64(&response_hash), "Hashes must be sha256 hex");
        require!(signing_algo == "ecdsa" || signing_algo == "ed25519", "Unknown signing algorithm");
        let mut c = self.care_now(&token_id);
        require!(c.thought_credits >= 1, "No thoughts left: buy some with YARN");
        c.thought_credits -= 1;
        c.happiness = add_capped(c.happiness, 3);
        let n = c.thoughts;
        c.thoughts += 1;
        self.save_care(&token_id, c);
        let mut map = thoughts_map();
        map.insert(
            format!("{token_id}:{n}"),
            Thought {
                said,
                reply: reply.clone(),
                model,
                chat_id,
                request_hash,
                response_hash,
                signature,
                signing_address,
                signing_algo,
                at_ms: env::block_timestamp_ms(),
            },
        );
        map.flush();
        let short: String = reply.chars().take(140).collect();
        self.push_history(&token_id, "thought", short, None);
    }

    /// Stocks Miso's shelf with the wardrobe (once). Callable only by this contract's own account,
    /// for deployments that existed before the wardrobe.
    pub fn stock_wardrobe(&mut self) {
        require!(env::predecessor_account_id() == env::current_account_id(), "Only the alley itself");
        if self.supply.get("hat").copied().unwrap_or(0) > 0 {
            return;
        }
        self.stock_miso_wardrobe();
    }

    // ------------------------------------------------------------ views

    pub fn care(&self, token_id: String) -> Care {
        self.care_now(&token_id)
    }

    /// Thoughts, oldest first.
    pub fn thoughts(&self, token_id: String, from: Option<u32>, limit: Option<u32>) -> Vec<Thought> {
        let len = cares().get(&token_id).map(|c| c.thoughts).unwrap_or(0);
        let from = from.unwrap_or(0);
        let end = len.min(from.saturating_add(limit.unwrap_or(20).min(50)));
        let map = thoughts_map();
        (from..end).filter_map(|i| map.get(&format!("{token_id}:{i}")).cloned()).collect()
    }
}

impl Alley {
    pub(crate) fn stock_miso_wardrobe(&mut self) {
        let miso = self.merchants.iter().find(|m| m.account.as_str().starts_with("miso.")).map(|m| m.account.clone());
        if let Some(m) = miso {
            for (item, n) in [("hat", 6), ("scarf", 8), ("bow", 10), ("glasses", 4)] {
                self.mint(item, &m, n);
            }
        }
    }
}
