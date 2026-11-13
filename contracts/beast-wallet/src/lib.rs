//! beast-wallet: the code that runs on every Beast's own account (`<token_id>.alley.ROOT`).
//!
//! Deployed once as a NEP-591 global contract and referenced by each Beast account, so a new
//! Beast costs a few hundred bytes of storage instead of a whole wasm.
//!
//! Control model (see docs/ARCHITECTURE.md, "How control works"):
//! - The current NFT owner holds exactly one function-call access key on this account, scoped to
//!   this account's own `execute` method. Its public key is `controller`.
//! - `execute` only runs when the transaction was signed by `controller`, the wallet is not frozen,
//!   and every inner call goes to the alley or the $YARN contract. There is no method that sends
//!   NEAR out, deploys code or adds keys on the owner's behalf.
//! - Only the alley contract can change `controller` (deleting the old key in the same receipt) or
//!   freeze the wallet (while the Beast wanders between owners).
use near_sdk::{env, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PublicKey};

/// Gas allowance on the controller key. Paid from the Beast's own NEAR balance.
const KEY_ALLOWANCE: NearToken = NearToken::from_millinear(250);

/// One call the Beast makes. Borsh-encoded (this contract carries no JSON parser, which keeps the
/// global-contract code small).
#[near(serializers = [borsh])]
pub struct Call {
    pub receiver_id: AccountId,
    pub method_name: String,
    /// JSON-encoded arguments for the receiving contract.
    pub args: String,
    pub deposit: u128,
    pub gas: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BeastWallet {
    alley: AccountId,
    yarn: AccountId,
    controller: Option<PublicKey>,
    frozen: bool,
    executed: u64,
}

#[near]
impl BeastWallet {
    /// Called by the alley in the same batch that creates this account.
    #[init]
    pub fn new(#[serializer(borsh)] alley: AccountId, #[serializer(borsh)] yarn: AccountId) -> Self {
        require!(env::predecessor_account_id() == alley, "Only the alley can initialise a Beast");
        Self { alley, yarn, controller: None, frozen: false, executed: 0 }
    }

    /// Runs calls as this Beast. Signed by the owner's controller key.
    pub fn execute(&mut self, #[serializer(borsh)] calls: Vec<Call>) -> Promise {
        require!(env::predecessor_account_id() == env::current_account_id(), "Call through this Beast's own key");
        require!(!self.frozen, "This Beast is wandering; nothing leaves until it is adopted");
        let signer = env::signer_account_pk();
        require!(self.controller.as_ref() == Some(&signer), "This key no longer controls the Beast");
        require!(!calls.is_empty() && calls.len() <= 4, "1 to 4 calls");

        let mut promise: Option<Promise> = None;
        for c in calls {
            require!(c.receiver_id == self.alley || c.receiver_id == self.yarn, "A Beast can only act in the alley");
            // At most 1 yoctoNEAR (the NEP-141/245 security deposit) may be attached.
            require!(c.deposit <= 1, "A Beast cannot send NEAR");
            let p = Promise::new(c.receiver_id).function_call(
                c.method_name,
                c.args.into_bytes(),
                NearToken::from_yoctonear(c.deposit),
                Gas::from_gas(c.gas),
            );
            promise = Some(match promise {
                None => p,
                Some(prev) => prev.then(p),
            });
        }
        self.executed += 1;
        promise.unwrap()
    }

    /// Swaps the controlling key. `None` revokes control entirely (used by nft_transfer).
    pub fn set_controller(&mut self, #[serializer(borsh)] public_key: Option<PublicKey>) -> Promise {
        self.assert_alley();
        let me = env::current_account_id();
        let mut p = Promise::new(me.clone());
        if let Some(old) = self.controller.take() {
            p = p.delete_key(old);
        }
        if let Some(new) = public_key.clone() {
            p = p.add_access_key_allowance(
                new,
                Allowance::limited(KEY_ALLOWANCE).unwrap(),
                me,
                "execute",
            );
        }
        self.controller = public_key;
        p
    }

    pub fn set_frozen(&mut self, #[serializer(borsh)] frozen: bool) {
        self.assert_alley();
        self.frozen = frozen;
    }

    #[result_serializer(borsh)]
    pub fn info(&self) -> (AccountId, AccountId, Option<PublicKey>, bool, u64) {
        (self.alley.clone(), self.yarn.clone(), self.controller.clone(), self.frozen, self.executed)
    }
}

impl BeastWallet {
    fn assert_alley(&self) {
        require!(env::predecessor_account_id() == self.alley, "Only the alley can do this");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ME: &str = "kit.alley.test";
    const ALLEY: &str = "alley.test";
    const YARN: &str = "yarn.test";

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn pk(n: u8) -> PublicKey {
        let mut bytes = vec![0u8];
        bytes.extend([n; 32]);
        PublicKey::try_from(bytes).unwrap()
    }

    /// A call arriving at the wallet: `pred` is the immediate caller, `signer` signed the transaction.
    fn ctx(pred: &str, signer: PublicKey) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(acc(ME))
            .predecessor_account_id(acc(pred))
            .signer_account_id(acc(pred))
            .signer_account_pk(signer)
            .build());
    }

    fn wallet_with(controller: u8) -> BeastWallet {
        ctx(ALLEY, pk(0));
        let mut w = BeastWallet::new(acc(ALLEY), acc(YARN));
        let _ = w.set_controller(Some(pk(controller)));
        w
    }

    fn call(to: &str, deposit: u128) -> Call {
        Call { receiver_id: acc(to), method_name: "feed".into(), args: "{}".into(), deposit, gas: 10_000_000_000_000 }
    }

    #[test]
    fn the_controller_key_can_act_in_the_alley() {
        let mut w = wallet_with(7);
        ctx(ME, pk(7));
        let _ = w.execute(vec![call(ALLEY, 0), call(YARN, 1)]);
        assert_eq!(w.info().4, 1);
    }

    #[test]
    #[should_panic(expected = "Only the alley can initialise")]
    fn only_the_alley_can_create_a_wallet() {
        ctx("mallory.test", pk(0));
        let _ = BeastWallet::new(acc(ALLEY), acc(YARN));
    }

    #[test]
    #[should_panic(expected = "no longer controls")]
    fn an_old_key_is_refused_after_a_handover() {
        let mut w = wallet_with(7);
        ctx(ALLEY, pk(0));
        let _ = w.set_controller(Some(pk(8))); // sold: the buyer's key replaces the seller's
        ctx(ME, pk(7));
        let _ = w.execute(vec![call(ALLEY, 0)]);
    }

    #[test]
    #[should_panic(expected = "no longer controls")]
    fn a_revoked_wallet_has_no_controller() {
        let mut w = wallet_with(7);
        ctx(ALLEY, pk(0));
        let _ = w.set_controller(None); // plain nft_transfer
        ctx(ME, pk(7));
        let _ = w.execute(vec![call(ALLEY, 0)]);
    }

    #[test]
    #[should_panic(expected = "own key")]
    fn other_accounts_cannot_call_execute() {
        let mut w = wallet_with(7);
        ctx("mallory.test", pk(7));
        let _ = w.execute(vec![call(ALLEY, 0)]);
    }

    #[test]
    #[should_panic(expected = "only act in the alley")]
    fn calls_outside_the_alley_are_refused() {
        let mut w = wallet_with(7);
        ctx(ME, pk(7));
        let _ = w.execute(vec![call("evil.test", 0)]);
    }

    #[test]
    #[should_panic(expected = "cannot send NEAR")]
    fn a_beast_cannot_send_near() {
        let mut w = wallet_with(7);
        ctx(ME, pk(7));
        let _ = w.execute(vec![call(ALLEY, 2)]);
    }

    #[test]
    #[should_panic(expected = "wandering")]
    fn a_wandering_beast_is_frozen() {
        let mut w = wallet_with(7);
        ctx(ALLEY, pk(0));
        w.set_frozen(true);
        ctx(ME, pk(7));
        let _ = w.execute(vec![call(ALLEY, 0)]);
    }

    #[test]
    #[should_panic(expected = "Only the alley can do this")]
    fn nobody_but_the_alley_swaps_keys() {
        let mut w = wallet_with(7);
        ctx(ME, pk(7));
        let _ = w.set_controller(Some(pk(9)));
    }

    #[test]
    #[should_panic(expected = "1 to 4 calls")]
    fn batches_are_bounded() {
        let mut w = wallet_with(7);
        ctx(ME, pk(7));
        let _ = w.execute((0..5).map(|_| call(ALLEY, 0)).collect());
    }
}
