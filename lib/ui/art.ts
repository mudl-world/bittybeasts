// Art slot registry. Every graphic in the game is looked up here by slot name.
// To swap in real art: drop a file into public/art/ with the slot's filename.
// If the new file is a PNG/WebP, change that slot's `file` below (one line) — nothing else changes.

export type ArtSlot =
  | "cat-neutral"
  | "cat-happy"
  | "cat-curious"
  | "cat-surprised"
  | "cat-angry"
  | "cat-sleepy"
  | "cat-talk"
  | "cat-eat"
  | "cat-jump"
  | "cat-run-1"
  | "cat-run-2"
  | "cat-run-3"
  | "cat-run-4"
  | "cat-fall"
  | "cat-whip"
  | "cat-bind"
  | "rat-thief"
  | "merchant-tom"
  | "merchant-miso"
  | "merchant-bandit"
  | "merchant-clove"
  | "mark-scar"
  | "mark-bent-ear"
  | "mark-patch"
  | "rooftop-left"
  | "rooftop-mid"
  | "rooftop-right"
  | "alley-bg"
  | "room-bg"
  | "hero-bg"
  | "logo"
  | "item-yarn"
  | "ui-feed"
  | "ui-wardrobe"
  | "ui-talk"
  | "ui-cuddle"
  | "ui-persona"
  | "ui-missions"
  | "ui-lane"
  | "ui-ledger"
  | "ui-link-lit"
  | "ui-link-dark"
  | "ui-thought"
  | "ui-verified"
  | "ui-home"
  | "ui-signout"
  | "ui-close"
  | "ui-back"
  | "ui-sound-on"
  | "ui-sound-off"
  | "ui-help"
  | "ui-map"
  | "mission-safe"
  | "mission-daring"
  | "result-haul"
  | "result-fall"
  | "result-cashout"
  | "skill-speed"
  | "skill-reach"
  | "skill-grip"
  | "skill-luck"
  | "ctl-dash"
  | "ctl-whip"
  | "ctl-bind"
  | "ctl-cashout"
  | "st-clock"
  | "st-mint"
  | "st-burn"
  | "st-slot"
  | "st-open"
  | "st-closed"
  | "st-receipt"
  | "st-legend"
  | "st-plus"
  | "st-minus"
  | "st-sell"
  | "st-buy"
  | "ui-ribbon"
  | "ui-badge"
  | "ui-tag"
  | "stall-scene"
  | "diary-scene"
  | "ledger-scene"
  | "yarn-scene"
  | "backalley-scene"
  | "story-scene"
  | "lantern-lit"
  | "lantern-unlit"
  | "item-fish"
  | "item-button"
  | "item-bell"
  | "item-moonstone"
  | "item-charm"
  | "item-catnip"
  | "item-lantern"
  | "item-hat"
  | "item-scarf"
  | "item-bow"
  | "item-glasses"
  | "keychain-hero";

export type ArtSpec = { file: string; w: number; h: number; label: string; shows: string; cat: boolean };

const s = (file: string, w: number, h: number, label: string, shows: string, cat = false): ArtSpec => ({
  file,
  w,
  h,
  label,
  shows,
  cat,
});

export const ART: Record<ArtSlot, ArtSpec> = {
  "keychain-hero": s("keychain-hero.svg", 768, 768, "KEYCHAIN · hero", "The clay Alley Cat keychain on its ring, chained tail hanging — landing hero", true),
  "cat-neutral": s("cat-neutral.png", 640, 960, "CAT · neutral", "Beast portrait, neutral face", true),
  "cat-happy": s("cat-happy.png", 640, 960, "CAT · happy", "Beast portrait, happy (after a boop / good haul)", true),
  "cat-curious": s("cat-curious.png", 640, 960, "CAT · curious", "Beast portrait, curious (wake-up step 3, market browsing)", true),
  "cat-surprised": s("cat-surprised.png", 640, 960, "CAT · surprised", "Beast portrait, surprised (wake-up step 2)", true),
  "cat-angry": s("cat-angry.png", 640, 960, "CAT · angry", "Beast portrait, angry (lost a life / rat thief)", true),
  "cat-sleepy": s("cat-sleepy.png", 640, 960, "CAT · sleepy", "Beast portrait, sleepy (before wake, resting at 0 lives)", true),
  "cat-talk": s("cat-talk.png", 640, 960, "CAT · talking", "Room: mouth open, mid-sentence", true),
  "cat-eat": s("cat-eat.png", 640, 960, "CAT · eating", "Room: cheeks puffed, munching", true),
  "cat-jump": s("cat-jump.png", 512, 384, "CAT · big jump", "Prowl: full stretch leap, facing right", true),
  "cat-run-1": s("cat-run-1.png", 512, 384, "CAT · run 1", "Prowl sprite frame 1 of 4, side view facing right", true),
  "cat-run-2": s("cat-run-2.png", 512, 384, "CAT · run 2", "Prowl sprite frame 2 of 4", true),
  "cat-run-3": s("cat-run-3.png", 512, 384, "CAT · run 3", "Prowl sprite frame 3 of 4", true),
  "cat-run-4": s("cat-run-4.png", 512, 384, "CAT · run 4", "Prowl sprite frame 4 of 4", true),
  "cat-fall": s("cat-fall.png", 512, 384, "CAT · fall", "Prowl: tumbling off a roof", true),
  "cat-whip": s("cat-whip.png", 512, 384, "CAT · whip", "Prowl: Chain Whip — tail lashing forward", true),
  "cat-bind": s("cat-bind.png", 512, 384, "CAT · bind", "Prowl: Chain Bind — tail wrapping a rat", true),
  "rat-thief": s("rat-thief.png", 384, 256, "RAT · thief", "Prowl: rat thief with a sack, running left", true),
  "merchant-tom": s("merchant-tom.png", 512, 768, "MERCHANT · Tom", "Lantern Lane: Tom the fishmonger cat", true),
  "merchant-miso": s("merchant-miso.png", 512, 768, "MERCHANT · Miso", "Lantern Lane: Miso the trinket cat", true),
  "merchant-bandit": s("merchant-bandit.png", 512, 768, "MERCHANT · Bandit", "Lantern Lane: Bandit the fence", true),
  "merchant-clove": s("merchant-clove.png", 512, 768, "MERCHANT · Clove", "Lantern Lane: Clove the herbalist", true),
  "mark-scar": s("mark-scar.png", 256, 256, "MARK · scar", "Mark badge: a scar left by a lost life", true),
  "mark-bent-ear": s("mark-bent-ear.png", 256, 256, "MARK · bent ear", "Mark badge: a bent ear", true),
  "mark-patch": s("mark-patch.png", 256, 256, "MARK · patch", "Mark badge: an eye patch / stitched patch", true),
  "alley-bg": s("alley-bg.jpg", 2048, 768, "WORLD · skyline", "Prowl background: night skyline (tiled mirrored)"),
  "room-bg": s("room-bg.jpg", 1622, 913, "WORLD · cat room", "The cat's attic room above the Lane"),
  "hero-bg": s("hero-bg.jpg", 1622, 913, "WORLD · Lantern Lane", "Landing hero: the Lane under the Great Yarn"),
  "logo": s("logo.png", 1956, 644, "Bitty Beasts", "Wordmark"),
  "rooftop-left": s("rooftop-left.png", 693, 284, "ROOF · left cap", "Prowl roof, left end"),
  "rooftop-mid": s("rooftop-mid.png", 815, 284, "ROOF · middle", "Prowl roof, repeating middle"),
  "rooftop-right": s("rooftop-right.png", 661, 284, "ROOF · right cap", "Prowl roof, right end"),
  "lantern-lit": s("lantern-lit.svg", 64, 96, "lantern lit", "Paper lantern, glowing"),
  "lantern-unlit": s("lantern-unlit.svg", 64, 96, "lantern out", "Paper lantern, dark"),
  "item-fish": s("item-fish.png", 256, 256, "ITEM · fish", "Item icon: fish"),
  "item-button": s("item-button.png", 256, 256, "ITEM · button", "Item icon: shiny button"),
  "item-bell": s("item-bell.png", 256, 256, "ITEM · bell", "Item icon: bell (rare)"),
  "item-moonstone": s("item-moonstone.png", 256, 256, "ITEM · moonstone", "Item icon: moonstone (rare)"),
  "item-charm": s("item-charm.png", 256, 256, "ITEM · charm", "Item icon: lucky charm (saves a haul once)"),
  "item-catnip": s("item-catnip.png", 256, 256, "ITEM · catnip", "Item icon: catnip"),
  "item-hat": s("item-hat.png", 256, 256, "ITEM · hat", "Wardrobe: knitted hat (drawn in code style; replace if you like)"),
  "item-scarf": s("item-scarf.png", 256, 256, "ITEM · scarf", "Wardrobe: scarf"),
  "item-bow": s("item-bow.png", 256, 256, "ITEM · bow", "Wardrobe: ribbon bow"),
  "item-glasses": s("item-glasses.png", 256, 256, "ITEM · glasses", "Wardrobe: round glasses"),
  "item-yarn": s("item-yarn.png", 256, 256, "ITEM · YARN", "The YARN coin: a ball of yarn"),
  "ui-feed": s("ui-feed.png", 256, 256, "UI · feed", "Room action: feed"),
  "ui-wardrobe": s("ui-wardrobe.png", 256, 256, "UI · wardrobe", "Room action: wardrobe"),
  "ui-talk": s("ui-talk.png", 256, 256, "UI · talk", "Room action: talk"),
  "ui-cuddle": s("ui-cuddle.png", 256, 256, "UI · cuddle", "Room action: daily cuddle"),
  "ui-persona": s("ui-persona.png", 256, 256, "UI · personality", "Room action: personality"),
  "ui-missions": s("ui-missions.png", 256, 256, "UI · missions", "Go on missions"),
  "ui-lane": s("ui-lane.png", 256, 256, "UI · Lantern Lane", "The market"),
  "ui-ledger": s("ui-ledger.png", 256, 256, "UI · Ledger", "The Lantern Ledger"),
  "ui-link-lit": s("ui-link-lit.png", 256, 256, "UI · life lit", "A lit tail link (a life)"),
  "ui-link-dark": s("ui-link-dark.png", 256, 256, "UI · life lost", "A dark tail link"),
  "ui-thought": s("ui-thought.png", 256, 256, "UI · thought", "A thought credit"),
  "mission-safe": s("mission-safe.png", 676, 939, "mission-safe", "UI art (mission-safe)"),
  "mission-daring": s("mission-daring.png", 677, 940, "mission-daring", "UI art (mission-daring)"),
  "result-haul": s("result-haul.png", 500, 640, "result-haul", "UI art (result-haul)"),
  "result-fall": s("result-fall.png", 504, 615, "result-fall", "UI art (result-fall)"),
  "result-cashout": s("result-cashout.png", 470, 646, "result-cashout", "UI art (result-cashout)"),
  "skill-speed": s("skill-speed.png", 382, 315, "skill-speed", "UI art (skill-speed)"),
  "skill-reach": s("skill-reach.png", 360, 362, "skill-reach", "UI art (skill-reach)"),
  "skill-grip": s("skill-grip.png", 370, 366, "skill-grip", "UI art (skill-grip)"),
  "skill-luck": s("skill-luck.png", 322, 352, "skill-luck", "UI art (skill-luck)"),
  "ctl-dash": s("ctl-dash.png", 329, 388, "ctl-dash", "UI art (ctl-dash)"),
  "ctl-whip": s("ctl-whip.png", 362, 365, "ctl-whip", "UI art (ctl-whip)"),
  "ctl-bind": s("ctl-bind.png", 360, 378, "ctl-bind", "UI art (ctl-bind)"),
  "ctl-cashout": s("ctl-cashout.png", 360, 391, "ctl-cashout", "UI art (ctl-cashout)"),
  "st-clock": s("st-clock.png", 340, 298, "st-clock", "UI art (st-clock)"),
  "st-mint": s("st-mint.png", 319, 268, "st-mint", "UI art (st-mint)"),
  "st-burn": s("st-burn.png", 285, 315, "st-burn", "UI art (st-burn)"),
  "st-slot": s("st-slot.png", 304, 319, "st-slot", "UI art (st-slot)"),
  "st-open": s("st-open.png", 351, 291, "st-open", "UI art (st-open)"),
  "st-closed": s("st-closed.png", 322, 277, "st-closed", "UI art (st-closed)"),
  "st-receipt": s("st-receipt.png", 277, 285, "st-receipt", "UI art (st-receipt)"),
  "st-legend": s("st-legend.png", 308, 300, "st-legend", "UI art (st-legend)"),
  "st-plus": s("st-plus.png", 296, 270, "st-plus", "UI art (st-plus)"),
  "st-minus": s("st-minus.png", 291, 269, "st-minus", "UI art (st-minus)"),
  "st-sell": s("st-sell.png", 327, 285, "st-sell", "UI art (st-sell)"),
  "st-buy": s("st-buy.png", 301, 293, "st-buy", "UI art (st-buy)"),
  "ui-ribbon": s("ui-ribbon.png", 581, 156, "ui-ribbon", "UI art (ui-ribbon)"),
  "ui-badge": s("ui-badge.png", 165, 161, "ui-badge", "UI art (ui-badge)"),
  "ui-tag": s("ui-tag.png", 203, 140, "ui-tag", "UI art (ui-tag)"),
  "stall-scene": s("stall-scene.jpg", 1628, 916, "stall-scene", "Scene backdrop (stall-scene)"),
  "diary-scene": s("diary-scene.jpg", 1628, 916, "diary-scene", "Scene backdrop (diary-scene)"),
  "ledger-scene": s("ledger-scene.jpg", 1628, 916, "ledger-scene", "Scene backdrop (ledger-scene)"),
  "yarn-scene": s("yarn-scene.jpg", 1628, 916, "yarn-scene", "Scene backdrop (yarn-scene)"),
  "backalley-scene": s("backalley-scene.jpg", 1628, 916, "backalley-scene", "Scene backdrop (backalley-scene)"),
  "story-scene": s("story-scene.jpg", 1628, 916, "story-scene", "Scene backdrop (story-scene)"),
  "ui-home": s("ui-home.png", 256, 256, "UI · title screen", "Back to the title screen"),
  "ui-signout": s("ui-signout.png", 256, 256, "UI · sign out", "Sign out"),
  "ui-close": s("ui-close.png", 256, 256, "UI · close", "Close a panel or the map"),
  "ui-back": s("ui-back.png", 256, 256, "UI · back", "Go back"),
  "ui-sound-on": s("ui-sound-on.png", 256, 256, "UI · sound on", "The cat speaks out loud"),
  "ui-sound-off": s("ui-sound-off.png", 256, 256, "UI · sound off", "The cat is quiet"),
  "ui-help": s("ui-help.png", 256, 256, "UI · help", "What is this?"),
  "ui-map": s("ui-map.png", 256, 256, "UI · map", "Open the map"),
  "ui-verified": s("ui-verified.png", 256, 256, "UI · verified", "Verified by NEAR AI"),
  "item-lantern": s("item-lantern.png", 256, 256, "ITEM · lantern", "Item icon: spare lantern"),
};

export const artSrc = (slot: ArtSlot) => `/art/${ART[slot].file}`;

export const EXPRESSIONS = ["neutral", "happy", "curious", "surprised", "angry", "sleepy", "talk", "eat"] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const catSlot = (e: Expression): ArtSlot => `cat-${e}`;

export function markSlot(kind: string): ArtSlot {
  const k = kind.toLowerCase();
  if (k.includes("ear")) return "mark-bent-ear";
  if (k.includes("patch")) return "mark-patch";
  return "mark-scar";
}

export function itemSlot(item: string): ArtSlot {
  const k = `item-${item}`;
  return (k in ART ? k : "item-button") as ArtSlot;
}

export function merchantSlot(accountOrKey: string): ArtSlot {
  const key = accountOrKey.split(".")[0];
  const k = `merchant-${key}`;
  return (k in ART ? k : "merchant-tom") as ArtSlot;
}

/**
 * Where each piece of clothing sits on a cat portrait, as percentages of the portrait box.
 * Tune these to the artist's cat drawings (one line per item).
 */
export const OUTFIT_ANCHORS: Record<"hat" | "scarf" | "bow" | "glasses", { top: number; left: number; width: number; rotate?: number }> = {
  hat: { top: -4, left: 29, width: 42, rotate: -6 },
  glasses: { top: -7, left: 9, width: 82 },
  scarf: { top: 47, left: 29, width: 42 },
  bow: { top: 46, left: 40, width: 20 },
};
