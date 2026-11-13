use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const NIGHT: u64 = 600_000;
const SECRET: &str = "keychain-secret-1";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn pk(n: u8) -> PublicKey {
    let mut bytes = vec![0u8];
    bytes.extend([n; 32]);
    PublicKey::try_from(bytes).unwrap()
}

fn ctx(pred: &str, deposit: NearToken, ms: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("alley.test"))
        .predecessor_account_id(acc(pred))
        .signer_account_id(acc(pred))
        .attached_deposit(deposit)
        .block_timestamp(ms * 1_000_000)
        .build());
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn setup() -> Alley {
    ctx("deployer.test", NearToken::from_yoctonear(0), 1);
    let mut a = Alley::new(
        acc("studio.test"),
        acc("referee.test"),
        acc("yarn.test"),
        acc("wallet.test"),
        U64(NIGHT),
        vec![
            (acc("tom.test"), "Old Tom".into(), pk(1)),
            (acc("clove.test"), "Sister Clove".into(), pk(2)),
        ],
    );
    ctx("studio.test", NearToken::from_millinear(300), 2);
    let _ = a.register_beast(
        "inky".into(),
        "Inky".into(),
        "/art/cat-neutral.svg".into(),
        Stats { reach: 6, grip: 5, speed: 7, luck: 9 },
        hex(&env::sha256(SECRET.as_bytes())),
    );
    a
}

fn woken() -> Alley {
    let mut a = setup();
    ctx("alice.test", NearToken::from_yoctonear(0), 3);
    let _ = a.wake("inky".into(), SECRET.into(), pk(9));
    a
}

#[test]
fn register_mints_to_studio_with_own_account() {
    let a = setup();
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.owner_id, acc("studio.test"));
    assert_eq!(b.account_id, acc("inky.alley.test"));
    assert_eq!(b.lives, 9);
    assert!(!b.woken);
    // genesis shelves
    assert_eq!(a.balance_of("fish", &acc("tom.test")), 18);
    assert_eq!(a.balance_of("charm", &acc("clove.test")), 8);
}

#[test]
#[should_panic(expected = "does not match")]
fn wake_needs_the_real_keychain() {
    let mut a = setup();
    ctx("alice.test", NearToken::from_yoctonear(0), 3);
    let _ = a.wake("inky".into(), "photo-of-the-wrong-card".into(), pk(9));
}

#[test]
fn wake_gives_ownership_and_controller() {
    let a = woken();
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.owner_id, acc("alice.test"));
    assert_eq!(b.controller, Some(pk(9)));
    assert_eq!(a.registered_beasts, 1);
    assert_eq!(a.beasts_for_owner(acc("alice.test")).len(), 1);
    assert_eq!(a.beasts_for_owner(acc("studio.test")).len(), 0);
}

fn run(a: &mut Alley, daring: bool, rooftops: u32, haul: Vec<(&str, u128)>, fell: bool) {
    ctx("referee.test", NearToken::from_yoctonear(0), 10);
    let _ = a.settle_run(
        "inky".into(),
        daring,
        rooftops,
        haul.into_iter().map(|(i, n)| (i.to_string(), U128(n))).collect(),
        fell,
        None,
        BTreeMap::new(),
        0,
    );
}

#[test]
fn safe_run_mints_loot_to_the_beast_account() {
    let mut a = woken();
    run(&mut a, false, 4, vec![("fish", 3), ("button", 2)], false);
    assert_eq!(a.balance_of("fish", &acc("inky.alley.test")), 3);
    assert_eq!(a.beast("inky".into()).unwrap().lives, 9);
}

#[test]
fn daring_fall_costs_a_life_leaves_a_mark_and_drops_the_haul() {
    let mut a = woken();
    run(&mut a, true, 7, vec![("bell", 4), ("moonstone", 1)], true);
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.lives, 8);
    assert_eq!(b.marks.len(), 1);
    assert_eq!(a.balance_of("bell", &acc("inky.alley.test")), 0);
}

#[test]
fn lucky_charm_catches_one_fall() {
    let mut a = woken();
    a.mint("charm", &acc("inky.alley.test"), 1);
    run(&mut a, true, 5, vec![("bell", 2)], true);
    assert_eq!(a.beast("inky".into()).unwrap().lives, 9);
    assert_eq!(a.balance_of("charm", &acc("inky.alley.test")), 0);
}

#[test]
#[should_panic(expected = "Haul too big")]
fn referee_cannot_print_items() {
    let mut a = woken();
    run(&mut a, false, 1, vec![("fish", 50)], false);
}

#[test]
#[should_panic(expected = "Resting")]
fn no_daring_runs_at_zero_lives() {
    let mut a = woken();
    for _ in 0..9 {
        run(&mut a, true, 3, vec![], true);
    }
    run(&mut a, true, 3, vec![], false);
}

#[test]
fn boop_relights_a_link_once_a_day() {
    let mut a = woken();
    run(&mut a, true, 3, vec![], true);
    ctx("alice.test", NearToken::from_yoctonear(0), 20);
    let _ = a.boop("inky".into(), SECRET.into());
    assert_eq!(a.beast("inky".into()).unwrap().lives, 9);
}

#[test]
#[should_panic(expected = "Already booped")]
fn boop_twice_in_a_day_fails() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(0), 20);
    let _ = a.boop("inky".into(), SECRET.into());
    ctx("alice.test", NearToken::from_yoctonear(0), 30);
    let _ = a.boop("inky".into(), SECRET.into());
}

#[test]
fn wander_then_adopt_moves_everything_and_pays_royalty() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(1), 40);
    let _ = a.wander("inky".into(), U128(10u128.pow(24)));
    assert!(a.beast("inky".into()).unwrap().wander.is_some());
    ctx("bob.test", NearToken::from_near(1), 50);
    let _ = a.adopt("inky".into(), SECRET.into(), pk(7));
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.owner_id, acc("bob.test"));
    assert_eq!(b.controller, Some(pk(7)));
    assert!(b.wander.is_none());
    let h = a.history("inky".into(), None, None);
    assert!(h.iter().any(|e| e.kind == "adopt" && e.text.contains("0.100 NEAR royalty")));
}

#[test]
#[should_panic(expected = "cannot prowl now")]
fn wandering_beast_cannot_prowl() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(1), 40);
    let _ = a.wander("inky".into(), U128(1));
    run(&mut a, false, 2, vec![], false);
}

#[test]
#[should_panic(expected = "seller cannot adopt")]
fn seller_cannot_readopt() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(1), 40);
    let _ = a.wander("inky".into(), U128(1));
    ctx("alice.test", NearToken::from_near(1), 50);
    let _ = a.adopt("inky".into(), SECRET.into(), pk(8));
}

#[test]
fn nft_transfer_revokes_the_controller() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(1), 40);
    a.nft_transfer(acc("carol.test"), "inky".into(), None, None);
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.owner_id, acc("carol.test"));
    assert!(b.controller.is_none());
}

#[test]
fn empty_till_turns_the_lights_out_and_revive_relights() {
    let mut a = woken();
    ctx("anyone.test", NearToken::from_yoctonear(0), NIGHT + 5);
    let _ = a.close_night();
    let tom = &a.merchants()[0];
    assert!(!tom.open);
    assert_eq!(tom.lanterns, 8);
    // An investor Beast revives Tom with 200 YARN.
    ctx("yarn.test", NearToken::from_yoctonear(0), NIGHT + 10);
    let _ = a.ft_on_transfer(acc("inky.alley.test"), U128(200), r#"{"revive":{"target":"tom.test"}}"#.into());
    let tom = &a.merchants()[0];
    assert!(tom.open);
    assert_eq!(tom.lanterns, 9);
}

#[test]
fn stall_respects_floor_and_never_sell() {
    let mut a = woken();
    ctx("inky.alley.test", NearToken::from_yoctonear(0), 60);
    a.open_stall(3);
    let mut floors = BTreeMap::new();
    floors.insert("bell".to_string(), U128(30));
    a.set_stall_rules(StallRules { floors, never_sell: vec!["moonstone".into()], buy_below: None, nightly_budget: None });
    a.mint("bell", &acc("inky.alley.test"), 2);
    ctx("yarn.test", NearToken::from_yoctonear(0), 70);
    let refund = a.ft_on_transfer(
        acc("buyer.test"),
        U128(70),
        r#"{"buy_stall":{"slot":3,"item":"bell","amount":"2","price_per":"30"}}"#.into(),
    );
    match refund {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 10),
        _ => panic!(),
    }
    assert_eq!(a.balance_of("bell", &acc("buyer.test")), 2);
    let h = a.history("inky".into(), None, None);
    assert!(h.iter().any(|e| e.kind == "receipt"));
}

#[test]
#[should_panic(expected = "Below the floor")]
fn stall_rejects_lowball() {
    let mut a = woken();
    ctx("inky.alley.test", NearToken::from_yoctonear(0), 60);
    a.open_stall(0);
    let mut floors = BTreeMap::new();
    floors.insert("bell".to_string(), U128(30));
    a.set_stall_rules(StallRules { floors, never_sell: vec![], buy_below: None, nightly_budget: None });
    a.mint("bell", &acc("inky.alley.test"), 1);
    ctx("yarn.test", NearToken::from_yoctonear(0), 70);
    let _ = a.ft_on_transfer(acc("buyer.test"), U128(10), r#"{"buy_stall":{"slot":0,"item":"bell","amount":"1","price_per":"10"}}"#.into());
}

#[test]
fn nep245_transfer_and_balances() {
    let mut a = woken();
    ctx("tom.test", NearToken::from_yoctonear(1), 80);
    a.mt_transfer(acc("bob.test"), "fish".into(), U128(5), None, None);
    assert_eq!(a.mt_balance_of(acc("bob.test"), "fish".into()).0, 5);
    assert_eq!(a.mt_supply("fish".into()).unwrap().0, 18);
}

// ---------------------------------------------------------------- the cat room

const INKY: &str = "inky.alley.test";

fn hash64(c: char) -> String {
    std::iter::repeat(c).take(64).collect()
}

fn record(a: &mut Alley) {
    ctx("referee.test", NearToken::from_yoctonear(0), 50_000);
    a.record_thought(
        "inky".into(),
        "who are you?".into(),
        "Inky. Mostly whiskers.".into(),
        "zai-org/GLM-5.1-FP8".into(),
        "chatcmpl-1".into(),
        hash64('a'),
        hash64('b'),
        "0xsig".into(),
        "0xsigner".into(),
        "ecdsa".into(),
    );
}

#[test]
fn feeding_burns_the_fish_and_fills_the_beast() {
    let mut a = woken();
    a.mint("fish", &acc(INKY), 2);
    ctx(INKY, NearToken::from_yoctonear(0), 20);
    a.feed("fish".into());
    assert_eq!(a.balance_of("fish", &acc(INKY)), 1);
    assert_eq!(a.care("inky".into()).fullness, 100);
}

#[test]
#[should_panic(expected = "Only a Beast can eat")]
fn only_the_beast_account_eats() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_yoctonear(0), 20);
    a.feed("fish".into());
}

#[test]
fn hunger_and_happiness_fall_over_time() {
    let mut a = woken();
    ctx(INKY, NearToken::from_yoctonear(0), 0);
    let mut c = a.care_now("inky");
    c.fullness = 50;
    c.happiness = 50;
    a.save_care("inky", c);
    ctx(INKY, NearToken::from_yoctonear(0), 20 * 60_000);
    let now = a.care("inky".into());
    assert_eq!(now.fullness, 30);
    assert_eq!(now.happiness, 37);
}

#[test]
#[should_panic(expected = "Too hungry")]
fn a_starving_beast_skips_daring_runs() {
    let mut a = woken();
    ctx(INKY, NearToken::from_yoctonear(0), 10);
    let mut c = a.care_now("inky");
    c.fullness = 5;
    a.save_care("inky", c);
    run(&mut a, true, 5, vec![("bell", 1)], false);
}

#[test]
fn prowling_makes_the_beast_hungry() {
    let mut a = woken();
    run(&mut a, false, 3, vec![("fish", 1)], false);
    assert_eq!(a.care("inky".into()).fullness, 70 - PROWL_HUNGER);
}

#[test]
#[should_panic(expected = "Buy a hat")]
fn dressing_needs_the_cosmetic() {
    let mut a = woken();
    ctx(INKY, NearToken::from_yoctonear(0), 20);
    a.dress(vec!["hat".into()]);
}

#[test]
fn dressing_up_cheers_the_beast() {
    let mut a = woken();
    a.mint("hat", &acc(INKY), 1);
    a.mint("bow", &acc(INKY), 1);
    ctx(INKY, NearToken::from_yoctonear(0), 20);
    a.dress(vec!["hat".into(), "bow".into()]);
    let c = a.care("inky".into());
    assert_eq!(c.outfit, vec!["hat".to_string(), "bow".to_string()]);
    assert_eq!(c.happiness, 85);
}

#[test]
#[should_panic(expected = "Unknown item")]
fn cosmetics_never_fall_off_rooftops() {
    let mut a = woken();
    run(&mut a, false, 3, vec![("hat", 1)], false);
}

#[test]
fn the_beast_pays_yarn_for_thoughts_and_each_reply_is_recorded() {
    let mut a = woken();
    ctx("yarn.test", NearToken::from_yoctonear(0), 30);
    let _ = a.ft_on_transfer(acc(INKY), U128(3), "{\"think\":{}}".into());
    assert_eq!(a.care("inky".into()).thought_credits, 3);
    record(&mut a);
    let c = a.care("inky".into());
    assert_eq!(c.thought_credits, 2);
    assert_eq!(c.thoughts, 1);
    let t = a.thoughts("inky".into(), None, None);
    assert_eq!(t.len(), 1);
    assert_eq!(t[0].reply, "Inky. Mostly whiskers.");
    assert_eq!(t[0].request_hash, hash64('a'));
}

#[test]
#[should_panic(expected = "No thoughts left")]
fn no_credit_no_thought() {
    let mut a = woken();
    record(&mut a);
}

#[test]
#[should_panic(expected = "Only a Beast can buy thoughts")]
fn only_beasts_buy_thoughts() {
    let mut a = woken();
    ctx("yarn.test", NearToken::from_yoctonear(0), 30);
    let _ = a.ft_on_transfer(acc("alice.test"), U128(3), "{\"think\":{}}".into());
}

// ---------------------------------------------------------------- NEP-178 approvals (marketplaces)

#[test]
fn an_approved_market_can_sell_the_beast_once() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_millinear(3), 20);
    let _ = a.nft_approve("inky".into(), acc("market.test"), None);
    assert!(a.nft_is_approved("inky".into(), acc("market.test"), Some(1)));
    // the market sells it to bob
    ctx("market.test", NearToken::from_yoctonear(1), 30);
    a.nft_transfer(acc("bob.test"), "inky".into(), Some(1), None);
    let b = a.beast("inky".into()).unwrap();
    assert_eq!(b.owner_id, acc("bob.test"));
    assert!(b.controller.is_none(), "the seller's key is revoked");
    assert!(!a.nft_is_approved("inky".into(), acc("market.test"), None), "approvals clear on sale");
}

#[test]
#[should_panic(expected = "Only the owner or an approved account")]
fn strangers_cannot_transfer() {
    let mut a = woken();
    ctx("mallory.test", NearToken::from_yoctonear(1), 20);
    a.nft_transfer(acc("mallory.test"), "inky".into(), None, None);
}

#[test]
#[should_panic(expected = "out of date")]
fn a_stale_approval_id_is_refused() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_millinear(3), 20);
    let _ = a.nft_approve("inky".into(), acc("market.test"), None);
    let _ = a.nft_approve("inky".into(), acc("market.test"), None); // re-approved: id 2
    ctx("market.test", NearToken::from_yoctonear(1), 30);
    a.nft_transfer(acc("bob.test"), "inky".into(), Some(1), None);
}

#[test]
#[should_panic(expected = "Only the owner or an approved account")]
fn a_revoked_market_cannot_sell() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_millinear(3), 20);
    let _ = a.nft_approve("inky".into(), acc("market.test"), None);
    ctx("alice.test", NearToken::from_yoctonear(1), 21);
    a.nft_revoke("inky".into(), acc("market.test"));
    ctx("market.test", NearToken::from_yoctonear(1), 30);
    a.nft_transfer(acc("bob.test"), "inky".into(), None, None);
}

#[test]
fn a_market_sale_pays_the_maker_royalty() {
    let mut a = woken();
    ctx("alice.test", NearToken::from_millinear(3), 20);
    let _ = a.nft_approve("inky".into(), acc("market.test"), None);
    ctx("market.test", NearToken::from_yoctonear(1), 30);
    let p = a.nft_transfer_payout(acc("bob.test"), "inky".into(), Some(1), None, U128(1_000), Some(2));
    assert_eq!(p.payout.get(&acc("studio.test")).unwrap().0, 100);
    assert_eq!(p.payout.get(&acc("alice.test")).unwrap().0, 900);
}
