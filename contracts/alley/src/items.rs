//! NEP-245 multi token: every item in the alley lives in this one contract.
//! Token ids: fish, button, bell, moonstone, charm, catnip, lantern.
use crate::*;
use near_sdk::ext_contract;

const GAS_MT_ON_TRANSFER: Gas = Gas::from_tgas(40);
const GAS_MT_RESOLVE: Gas = Gas::from_tgas(15);

#[ext_contract(ext_mt_receiver)]
pub trait MultiTokenReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

#[ext_contract(ext_self)]
pub trait SelfResolve {
    fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) -> Vec<U128>;
}

#[near(serializers = [json])]
pub struct MtToken {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
    pub metadata: MtTokenMetadata,
}

#[near(serializers = [json])]
pub struct MtTokenMetadata {
    pub title: String,
    pub description: String,
    pub media: String,
}

fn item_metadata(id: &str) -> MtTokenMetadata {
    let (title, description) = match id {
        "fish" => ("Fish", "Whipped off a windowsill. Old Tom's favourite."),
        "button" => ("Button", "Shiny, round, irresistible. Miso collects them."),
        "bell" => ("Bell", "Rings on rooftops. Bandit pays well."),
        "moonstone" => ("Moonstone", "Only falls on daring runs."),
        "charm" => ("Lucky Charm", "Catches one fall. Sister Clove's remedy."),
        "catnip" => ("Catnip", "A treat. Cheers a Beast right up."),
        "hat" => ("Knitted hat", "Miso knits them herself. Keeps the ears warm on the roofs."),
        "scarf" => ("Scarf", "Long enough to trip on. Very fashionable."),
        "bow" => ("Bow", "A ribbon bow for the collar."),
        "glasses" => ("Round glasses", "For a Beast who reads the Ledger."),
        _ => ("Lantern", "More rare finds on the next prowl."),
    };
    MtTokenMetadata { title: title.into(), description: description.into(), media: format!("/art/item-{id}.svg") }
}

fn bkey(item: &str, account: &AccountId) -> String {
    format!("{item}:{account}")
}

pub(crate) fn emit_mt(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "nep245", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

impl Alley {
    pub(crate) fn balance_of(&self, item: &str, account: &AccountId) -> u128 {
        self.balances.get(&bkey(item, account)).copied().unwrap_or(0)
    }

    fn set_balance(&mut self, item: &str, account: &AccountId, v: u128) {
        if v == 0 {
            self.balances.remove(&bkey(item, account));
        } else {
            self.balances.insert(bkey(item, account), v);
        }
    }

    pub(crate) fn mint(&mut self, item: &str, to: &AccountId, amount: u128) {
        require!(ITEMS.contains(&item), "Unknown item");
        let b = self.balance_of(item, to);
        self.set_balance(item, to, b + amount);
        let s = self.supply.get(item).copied().unwrap_or(0);
        self.supply.insert(item.to_string(), s + amount);
        emit_mt("mt_mint", json!({ "owner_id": to, "token_ids": [item], "amounts": [amount.to_string()] }));
    }

    pub(crate) fn burn(&mut self, item: &str, from: &AccountId, amount: u128) {
        let b = self.balance_of(item, from);
        require!(b >= amount, "Not enough items");
        self.set_balance(item, from, b - amount);
        let s = self.supply.get(item).copied().unwrap_or(0);
        self.supply.insert(item.to_string(), s.saturating_sub(amount));
        emit_mt("mt_burn", json!({ "owner_id": from, "token_ids": [item], "amounts": [amount.to_string()] }));
    }

    pub(crate) fn move_items(&mut self, item: &str, from: &AccountId, to: &AccountId, amount: u128, memo: Option<&str>) {
        require!(ITEMS.contains(&item), "Unknown item");
        require!(amount > 0, "Amount must be positive");
        require!(from != to, "Sender and receiver are the same");
        let b = self.balance_of(item, from);
        require!(b >= amount, format!("Not enough {item}"));
        self.set_balance(item, from, b - amount);
        let r = self.balance_of(item, to);
        self.set_balance(item, to, r + amount);
        let mut data = json!({
            "old_owner_id": from, "new_owner_id": to, "token_ids": [item], "amounts": [amount.to_string()]
        });
        if let Some(m) = memo {
            data["memo"] = json!(m);
        }
        emit_mt("mt_transfer", data);
    }
}

#[near]
impl Alley {
    // ------------------------------------------------------------ NEP-245 core

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval.is_none(), "Approvals are not supported");
        let sender = env::predecessor_account_id();
        self.move_items(&token_id, &sender, &receiver_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approvals.is_none(), "Approvals are not supported");
        require!(token_ids.len() == amounts.len(), "Length mismatch");
        let sender = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.move_items(t, &sender, &receiver_id, a.0, memo.as_deref());
        }
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        self.mt_batch_transfer_call(receiver_id, vec![token_id], vec![amount], approval.map(|a| vec![Some(a)]), memo, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(approvals.is_none(), "Approvals are not supported");
        require!(token_ids.len() == amounts.len(), "Length mismatch");
        let sender = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.move_items(t, &sender, &receiver_id, a.0, memo.as_deref());
        }
        let previous: Vec<AccountId> = token_ids.iter().map(|_| sender.clone()).collect();
        ext_mt_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_MT_ON_TRANSFER)
            .mt_on_transfer(sender.clone(), previous.clone(), token_ids.clone(), amounts.clone(), msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_MT_RESOLVE)
                    .mt_resolve_transfer(previous, receiver_id, token_ids, amounts),
            )
            .into()
    }

    /// Returns the amounts actually kept by the receiver; refunds the rest.
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
    ) -> Vec<U128> {
        let unused: Vec<U128> = match env::promise_result_checked(0, 1_000) {
            Ok(bytes) => serde_json::from_slice::<Vec<U128>>(&bytes)
                .ok()
                .filter(|v| v.len() == amounts.len())
                .unwrap_or_else(|| amounts.clone()),
            Err(_) => amounts.clone(),
        };
        let mut used = vec![];
        for i in 0..token_ids.len() {
            let refund = unused[i].0.min(amounts[i].0).min(self.balance_of(&token_ids[i], &receiver_id));
            if refund > 0 {
                self.move_items(&token_ids[i], &receiver_id, &previous_owner_ids[i], refund, Some("refund"));
            }
            used.push(U128(amounts[i].0 - refund));
        }
        used
    }

    // ------------------------------------------------------------ NEP-245 views

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balance_of(&token_id, &account_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|t| U128(self.balance_of(t, &account_id))).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        ITEMS.contains(&token_id.as_str()).then(|| U128(self.supply.get(&token_id).copied().unwrap_or(0)))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> {
        token_ids
            .into_iter()
            .map(|t| {
                ITEMS.contains(&t.as_str()).then(|| MtToken { metadata: item_metadata(&t), token_id: t, owner_id: None })
            })
            .collect()
    }

    pub fn mt_tokens(&self) -> Vec<MtToken> {
        ITEMS.iter().map(|t| MtToken { token_id: t.to_string(), owner_id: None, metadata: item_metadata(t) }).collect()
    }
}
