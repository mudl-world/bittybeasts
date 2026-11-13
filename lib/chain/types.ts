// Shared chain types. Mirrors docs/ARCHITECTURE.md and the Rust contracts.

export const ITEMS = ["fish", "button", "bell", "moonstone", "charm", "catnip", "lantern", "hat", "scarf", "bow", "glasses"] as const;
/** Things a Beast can wear (bought from Miso, worn in the cat room). */
export const COSMETICS = ["hat", "scarf", "bow", "glasses"] as const;
export type Cosmetic = (typeof COSMETICS)[number];
export type Item = (typeof ITEMS)[number];

export type Stats = { reach: number; grip: number; speed: number; luck: number };

export type Mark = { kind: string; note: string; at_ms: number };

export type Wander = { seller: string; price: string; until_ms: number; nonce: number };

export type Beast = {
  token_id: string;
  owner_id: string;
  account_id: string;
  name: string;
  maker: string;
  born_ms: number;
  media: string;
  stats: Stats;
  lives: number;
  lives_lost_total: number;
  lives_won_total: number;
  legend: boolean;
  marks: Mark[];
  woken: boolean;
  controller: string | null;
  wander: Wander | null;
  last_boop_ms: number;
  best_run: number;
  reputation: Record<string, number>;
};

export type HistoryEntry = { kind: string; text: string; at_ms: number; owner: string; yarn?: string };

export type MerchantView = {
  account_id: string;
  name: string;
  till: string;
  lanterns: number;
  open: boolean;
  retired: boolean;
  inventory: Partial<Record<Item, string>>;
  /** Items the merchant sold to Beasts tonight. */
  sold_tonight: Partial<Record<Item, string>>;
  /** Items Beasts sold to the merchant tonight. */
  bought_tonight: Partial<Record<Item, string>>;
  invested: string;
};

export type StallRules = {
  floors: Partial<Record<Item, string>>;
  never_sell: Item[];
  buy_below?: Partial<Record<Item, string>>;
  nightly_budget?: string;
};

export type StallView = {
  slot: number;
  token_id: string | null;
  beast_account: string | null;
  name: string | null;
  lanterns: number;
  rent_paid: string;
  rules: StallRules | null;
  stock: Partial<Record<Item, string>>;
  sales: number;
};

export type NightView = {
  night: number;
  night_ms: number;
  started_ms: number;
  rent: string;
  closed_through: number;
  registered_beasts: number;
};

export type Quote = {
  merchant: string;
  beast: string;
  side: "sell" | "buy";
  item: Item;
  amount: string;
  price_per: string;
  expires_ms: number;
  nonce: number;
};

export type YarnParams = {
  target_bps: number;
  mint_per_tug: string;
  burn_bps: number;
  max_lives: number;
  regen_every: number;
  night_ms: number;
  alley: string;
};

export type YarnState = {
  night: number;
  streak: number;
  longest: number;
  lives: number;
  run: number;
  tugs_tonight: number;
  target_tonight: number;
  registered_beasts: number;
  treasury: string;
  total_supply: string;
  festival: boolean;
};

export type YarnLogEntry = {
  night: number;
  kind: "mint" | "burn" | "life_lost" | "life_back" | "reset" | "record";
  amount: string;
  accounts: number;
  at_ms: number;
};

export type RunResult = {
  daring: boolean;
  rooftops: number;
  haul: [Item, number][];
  fell: boolean;
  mark?: string;
  whips_on_awning: Record<string, number>;
  binds: number;
};
