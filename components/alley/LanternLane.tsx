"use client";
// Lantern Lane: four merchant stalls (live signed quotes with their reasoning) and player stalls.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  buyFromMerchant,
  buyFromStall,
  getItemBalances,
  getMerchants,
  getQuote,
  getStalls,
  revive,
  sellToMerchant,
  ITEMS,
  type Beast,
  type Item,
  type MerchantView,
  type StallView,
} from "@/lib/chain";
import { CONFIG } from "@/lib/chain/config";
import { marketContext } from "@/lib/economy/live";
import { MERCHANTS, type MerchantId } from "@/lib/economy/pricing";
import type { MerchantRequest } from "@/lib/economy/requests";
import { merchantSlot } from "@/lib/ui/art";
import { QUIET, friendly } from "@/lib/ui/errors";
import { ITEM_LABEL, num, shortAccount, yarn } from "@/lib/ui/format";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "../Art";
import Lanterns from "../Lanterns";
import PriceTooltip from "../PriceTooltip";
import { Loading, Notice, Pill, Spinner } from "../ui";
import Dialog from "../Dialog";
import { RequestTag } from "../story/RequestBoard";
import { useTx } from "./useTx";

type QuoteResponse = Awaited<ReturnType<typeof getQuote>>;

/** YARN a dark shop's till needs to relight (REVIVE_COST in contracts/alley/src/market.rs). */
export const REVIVE_SUGGESTED = 200;

type Props = { beast: Beast; items: Record<Item, number> | undefined; yarnBalance: number | undefined; onChanged: () => void; onNeedsKey: () => void };

function merchantId(m: MerchantView): MerchantId | null {
  const key = m.account_id.split(".")[0];
  return key in MERCHANTS ? (key as MerchantId) : null;
}

export default function LanternLane({ beast, items, yarnBalance, onChanged, onNeedsKey }: Props) {
  const merchants = useAsync(() => getMerchants(), []);
  const stalls = useAsync(() => getStalls(), []);
  const board = useAsync(() => marketContext().then((c) => c.requests), []);
  const [open, setOpen] = useState<string | null>(null); // merchant account, or "stalls"
  const changed = useCallback(() => {
    merchants.reload();
    stalls.reload();
    board.reload();
    onChanged();
  }, [merchants, stalls, board, onChanged]);

  const list = merchants.data ?? [];
  const shop = list.find((m) => m.account_id === open);
  const requestOf = (m: MerchantView) => board.data?.find((r) => CONFIG.merchants[r.merchant] === m.account_id);

  return (
    <>
      {/* the street: merchant cats stand along it; tap one to step into their shop */}
      <div className="no-scrollbar fixed inset-x-0 bottom-[7.5rem] z-10 flex items-end justify-start gap-3 overflow-x-auto px-4 pt-10 sm:bottom-36 md:justify-center md:gap-[2vw]">
        {merchants.loading && !merchants.data ? (
          <div className="glass px-4 py-2">
            <Loading label="Lighting the lanterns…" />
          </div>
        ) : merchants.error && !merchants.data ? (
          <div className="glass px-4 py-2 text-sm">{QUIET}</div>
        ) : (
          <>
            {list.map((m) => {
              const r = requestOf(m);
              const wants = r && r.kind === "want" && r.remaining > 0 && r.merchant !== "clove";
              return (
                <button
                  key={m.account_id}
                  onClick={() => setOpen(m.account_id)}
                  className="group relative flex shrink-0 flex-col items-center"
                  aria-label={`Visit ${m.name}'s shop`}
                  title={`Visit ${m.name}'s shop`}
                >
                  {wants && (
                    <span className="absolute -top-3 right-0 z-10 flex h-10 w-10 animate-bounce items-center justify-center">
                      <Art slot="ui-badge" alt="" className="absolute inset-0 h-full w-full" />
                      <span className="relative font-display text-xl font-bold text-[#3a2410]">!</span>
                    </span>
                  )}
                  <Art
                    slot={merchantSlot(m.account_id)}
                    alt=""
                    className={`drop-shadow-[0_8px_10px_rgba(0,0,0,0.6)] transition group-hover:-translate-y-2 ${m.open ? "" : "grayscale brightness-75"}`}
                    style={{ width: "clamp(96px, 16vw, 150px)" }}
                  />
                  {/* the shop sign: lit when open, dark when the lanterns are out */}
                  <span className="relative -mt-2 flex items-center justify-center" style={{ width: "clamp(110px, 15vw, 150px)" }}>
                    <Art slot={m.open ? "st-open" : "st-closed"} alt="" className="w-full" />
                    <span className={`absolute bottom-[16%] left-[32%] right-[7%] top-[44%] flex items-center justify-center text-center font-display text-[0.6rem] font-bold leading-none sm:text-[0.72rem] ${m.open ? "text-[#3a2410]" : "text-paper/80"}`}>
                      {m.name}
                    </span>
                  </span>
                </button>
              );
            })}
            <StallsDoor onOpen={() => setOpen("stalls")} className="md:hidden" />
          </>
        )}
      </div>

      {/* On a wide screen the stalls stand apart at the end of the street (below). On a phone the
          row of cats already scrolls, so a fixed button would sit on top of whichever cat is last;
          there it rides along in the row instead. Either way it is never a fifth merchant. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[7.475rem] z-10 hidden justify-end px-4 md:flex xl:bottom-[8.975rem] xl:px-6">
        <StallsDoor onOpen={() => setOpen("stalls")} className="pointer-events-auto" />
      </div>

      {/* stepping into a shop: a full-screen scene, the keeper on the left, the counter on the right */}
      {(shop || open === "stalls") && (
        <ShopScene
          onLeave={() => setOpen(null)}
          keeper={shop ? <Keeper m={shop} request={requestOf(shop)} /> : <StallsSign />}
        >
          {shop ? (
            <MerchantStall m={shop} beast={beast} items={items} yarnBalance={yarnBalance} onChanged={changed} onNeedsKey={onNeedsKey} />
          ) : (
            <>
              <h2 className="title-3d text-2xl">Beasts&apos; stalls</h2>
              {stalls.loading && !stalls.data ? (
                <Loading label="Counting stalls…" />
              ) : stalls.error && !stalls.data ? (
                <Notice kind="info">{QUIET}</Notice>
              ) : (
                <PlayerStalls stalls={stalls.data ?? []} beast={beast} onChanged={changed} onNeedsKey={onNeedsKey} />
              )}
            </>
          )}
        </ShopScene>
      )}
    </>
  );
}

/** The full-screen shop: the street, dimmed, behind; the keeper on the left; the counter on the right. */
/** The way into the Beasts' stalls: the same lantern sign the merchants wear, so it belongs on the
    street, with the market stall above it instead of a cat. */
function StallsDoor({ onOpen, className = "" }: { onOpen: () => void; className?: string }) {
  return (
    <button
      onClick={onOpen}
      className={`group flex shrink-0 flex-col items-center ${className}`}
      aria-label="Beasts' stalls"
      title="Beasts' stalls: shops run by other players' cats"
    >
      <Art
        slot="ui-lane"
        alt=""
        className="drop-shadow-[0_8px_10px_rgba(0,0,0,0.6)] transition group-hover:-translate-y-2"
        style={{ width: "clamp(72px, 9vw, 104px)" }}
      />
      <span className="relative -mt-2 flex items-center justify-center" style={{ width: "clamp(92px, 11vw, 124px)" }}>
        <Art slot="st-open" alt="" className="w-full" />
        <span className="absolute bottom-[16%] left-[32%] right-[7%] top-[44%] flex items-center justify-center text-center font-display text-[0.6rem] font-bold leading-none text-[#3a2410] sm:text-[0.72rem]">
          Stalls
        </span>
      </span>
    </button>
  );
}

function ShopScene({ keeper, children, onLeave }: { keeper: React.ReactNode; children: React.ReactNode; onLeave: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onLeave();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onLeave]);
  return (
    <div className="fixed inset-0 z-[60] animate-rise overflow-hidden">
      <Art slot="hero-bg" alt="" className="absolute inset-0 h-full w-full scale-105 object-cover blur-[3px] brightness-[0.55] saturate-[0.8]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,transparent_25%,rgb(6_5_26/0.75)_80%)]" />
      {/* btn-sq, like every other icon tile: the pill's thick border would eat the arrow. */}
      <button onClick={onLeave} className="btn btn-ghost btn-sq absolute left-3 top-3 z-20 h-14 w-14 p-1 sm:left-5 sm:top-5" aria-label="Back to the street" title="Back to the street">
        <Art slot="ui-back" alt="" size={40} />
      </button>
      <div className="relative flex h-full flex-col md:flex-row">
        <div className="flex shrink-0 flex-col items-center justify-end px-4 pt-20 md:h-full md:w-[42%] md:pb-10 md:pt-24">{keeper}</div>
        {/* the counter: one fixed size for every shop, no frame, just a dark pane over the street */}
        <div className="flex min-h-0 flex-1 flex-col items-center p-3 pt-2 md:items-start md:p-6 md:pl-0 md:pt-24">
          <div className="flex h-[52dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl bg-night-950/75 p-4 backdrop-blur-md sm:p-6 md:h-[calc(100dvh-8.5rem)] md:w-[min(46rem,54vw)] md:max-w-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The shopkeeper, standing large, with their lanterns overhead and their line in a dialog box. */
function Keeper({ m, request }: { m: MerchantView; request: MerchantRequest | undefined }) {
  const id = merchantId(m);
  const meta = id ? MERCHANTS[id] : null;
  const line = !m.open
    ? "The lanterns are out. Help me relight them and I'll make it worth your while."
    : request && request.kind !== "closed"
      ? request.text
      : (meta?.personality ?? "Welcome to my stall.");
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <Lanterns lit={m.lanterns} size={16} />
      <Art
        slot={merchantSlot(m.account_id)}
        alt={m.name}
        className={`drop-shadow-[0_14px_20px_rgba(0,0,0,0.6)] ${m.open ? "" : "grayscale brightness-75"}`}
        style={{ width: "clamp(110px, 24vw, 300px)" }}
      />
      <Dialog name={m.name || meta?.name || "Merchant"} portrait={merchantSlot(m.account_id)} className="mt-3 w-full">
        <p>{line}</p>
        <div className="flex flex-wrap items-center gap-2">
          {m.open ? <Pill tone="moss">open</Pill> : <Pill tone="ember">lights out</Pill>}
          {request && request.kind !== "closed" && <RequestTag r={request} />}
        </div>
      </Dialog>
    </div>
  );
}

function StallsSign() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <Art slot="ui-lane" alt="" style={{ width: "clamp(110px, 20vw, 240px)" }} className="drop-shadow-[0_14px_20px_rgba(0,0,0,0.6)]" />
      <Dialog name="The stalls" portrait="ui-lane" className="mt-3 w-full">
        <p>Twelve slots along the Lane, each run by somebody&apos;s cat while its owner sleeps. Buy from them like any merchant.</p>
      </Dialog>
    </div>
  );
}

function MerchantStall({
  m,
  beast,
  items,
  yarnBalance,
  onChanged,
  onNeedsKey,
}: {
  m: MerchantView;
  beast: Beast;
  items: Record<Item, number> | undefined;
  yarnBalance: number | undefined;
  onChanged: () => void;
  onNeedsKey: () => void;
}) {
  const id = merchantId(m);
  const meta = id ? MERCHANTS[id] : null;
  const trades = Array.from(new Set<Item>([...(meta?.trades ?? []), ...(Object.keys(m.inventory) as Item[])])).filter((i) =>
    (ITEMS as readonly string[]).includes(i),
  );
  const tx = useTx(onNeedsKey);
  const [reviveAmt, setReviveAmt] = useState(String(REVIVE_SUGGESTED));
  const rep = beast.reputation[m.account_id] ?? (id ? beast.reputation[id] : undefined);

  return (
    <article className="flex flex-col gap-4">
      <h2 className="title-3d text-2xl">{m.name || meta?.name || shortAccount(m.account_id)}&apos;s counter</h2>
      <div className="flex flex-col gap-1">
          <p className="text-xs text-mist">
            Till <b className="text-paper">{yarn(m.till)} YARN</b> · {m.lanterns}/9 lanterns
            {rep !== undefined && rep !== 0 ? (
              <>
                {" "}· your standing <b className={rep > 0 ? "text-moss" : "text-[#ffb3a1]"}>{rep > 0 ? `+${rep}` : rep}</b>
              </>
            ) : null}
          </p>
      </div>

      {!m.open ? (
        <div className="flex flex-col gap-2 rounded-xl bg-night-950/50 p-3">
          <p className="text-sm">
            Lights out. Needs <b className="text-lantern">{REVIVE_SUGGESTED} YARN</b> to relight a lantern or three.
          </p>
          <div className="flex gap-2">
            <input className="input num w-28" inputMode="numeric" value={reviveAmt} onChange={(e) => setReviveAmt(e.target.value.replace(/\D/g, ""))} aria-label="YARN to put in" />
            <button
              className="btn btn-lantern btn-sm"
              disabled={!!tx.pending || !num(reviveAmt)}
              onClick={async () => {
                if (await tx.run("revive", () => revive(beast.token_id, m.account_id, num(reviveAmt)), `You put ${reviveAmt} YARN into ${m.name}'s till. The lanterns flicker on.`)) onChanged();
              }}
            >
              {tx.pending === "revive" ? <Spinner /> : null} Revive
            </button>
          </div>
          {yarnBalance !== undefined && <p className="text-xs text-mist">You have {yarn(yarnBalance)} YARN.</p>}
        </div>
      ) : null}

      <p className="text-center text-xs text-mist">Tap a price to hear the reasoning.</p>
      <div className="flex flex-col divide-y divide-white/5">
        {trades.map((item) => (
          <ItemRow key={item} m={m} item={item} beast={beast} have={items?.[item] ?? 0} onChanged={onChanged} onNeedsKey={onNeedsKey} />
        ))}
        {!trades.length && <p className="py-2 text-sm text-mist">Nothing on the counter tonight.</p>}
      </div>
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
    </article>
  );
}

function ItemRow({
  m,
  item,
  beast,
  have,
  onChanged,
  onNeedsKey,
}: {
  m: MerchantView;
  item: Item;
  beast: Beast;
  have: number;
  onChanged: () => void;
  onNeedsKey: () => void;
}) {
  const [amount, setAmount] = useState(1);
  const [quotes, setQuotes] = useState<{ sell?: QuoteResponse | null; buy?: QuoteResponse | null }>({});
  const [qErr, setQErr] = useState<string | null>(null);
  const [qTick, setQTick] = useState(0);
  const tx = useTx(onNeedsKey);

  useEffect(() => {
    if (!m.open) return;
    let live = true;
    const ask = (side: "sell" | "buy") => getQuote(beast.token_id, m.account_id, side, item, amount).then((q) => q, () => null);
    Promise.all([ask("sell"), ask("buy")]).then(([sell, buy]) => {
      if (!live) return;
      setQuotes({ sell, buy });
      setQErr(!sell && !buy ? "No prices right now." : null);
    });
    return () => {
      live = false;
    };
  }, [m.open, m.account_id, beast.token_id, item, amount, qTick]);

  async function fresh(side: "sell" | "buy"): Promise<QuoteResponse> {
    const q = quotes[side];
    if (q && q.quote.expires_ms - 3000 > Date.now()) return q;
    return getQuote(beast.token_id, m.account_id, side, item, amount);
  }

  const stock = num(m.inventory[item]);
  const sell = quotes.sell;
  const buy = quotes.buy;
  const sellPrice = sell?.price_per ?? 0;
  const buyPrice = buy?.price_per ?? 0;

  return (
    <div className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2">
        <Art slot={`item-${item}`} size={28} alt="" />
        <span className="font-display font-semibold">{ITEM_LABEL[item] ?? item}</span>
        <span className="text-xs text-mist">
          you have {have} · stall has {stock}
        </span>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <button className="transition hover:scale-110 disabled:opacity-40" aria-label="Fewer" onClick={() => setAmount((a) => Math.max(1, a - 1))} disabled={amount <= 1}>
            <Art slot="st-minus" alt="" size={34} />
          </button>
          <span className="num w-6 text-center">{amount}</span>
          <button className="transition hover:scale-110" aria-label="More" onClick={() => setAmount((a) => Math.min(20, a + 1))}>
            <Art slot="st-plus" alt="" size={34} />
          </button>
        </div>
      </div>
      {m.open && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="text-mist">Pays</span>
            {sell === undefined ? <Spinner className="text-mist" /> : sellPrice > 0 ? <PriceTooltip price={`${sellPrice} YARN`} reasoning={sell?.reasoning} /> : <PriceTooltip price="won't buy" reasoning={sell?.reasoning ?? "Not buying right now."} />}
            <button
              className="btn btn-lantern btn-sm ml-1"
              disabled={!!tx.pending || sellPrice <= 0 || have < amount}
              onClick={async () => {
                const ok = await tx.run(
                  "sell",
                  async () => sellToMerchant(beast.token_id, m.account_id, item, amount, await fresh("sell")),
                  `Sold ${amount} ${item} for ${sellPrice * amount} YARN.`,
                );
                setQTick((t) => t + 1);
                if (ok) onChanged();
              }}
            >
              {tx.pending === "sell" ? <Spinner /> : <Art slot="st-sell" alt="" size={22} />} Sell
            </button>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-mist">Charges</span>
            {buy === undefined ? <Spinner className="text-mist" /> : buyPrice > 0 ? <PriceTooltip price={`${buyPrice} YARN`} reasoning={buy?.reasoning} /> : <PriceTooltip price="none to sell" reasoning={buy?.reasoning ?? "Nothing in stock."} />}
            <button
              className="btn btn-ghost btn-sm ml-1"
              disabled={!!tx.pending || buyPrice <= 0 || stock < amount}
              onClick={async () => {
                const ok = await tx.run(
                  "buy",
                  async () => buyFromMerchant(beast.token_id, m.account_id, item, amount, await fresh("buy")),
                  `Bought ${amount} ${item} for ${buyPrice * amount} YARN.`,
                );
                setQTick((t) => t + 1);
                if (ok) onChanged();
              }}
            >
              {tx.pending === "buy" ? <Spinner /> : <Art slot="st-buy" alt="" size={22} />} Buy
            </button>
          </span>
        </div>
      )}
      {qErr && <p className="text-xs text-mist">{qErr}</p>}
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
    </div>
  );
}

function PlayerStalls({ stalls, beast, onChanged, onNeedsKey }: { stalls: StallView[]; beast: Beast; onChanged: () => void; onNeedsKey: () => void }) {
  const open = stalls.filter((s) => s.token_id && s.token_id !== beast.token_id);
  if (!open.length) return <p className="text-sm text-mist">No other Beasts have a stall open tonight. Open yours under My Stall.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {open.map((s) => (
        <PlayerStall key={s.slot} s={s} beast={beast} onChanged={onChanged} onNeedsKey={onNeedsKey} />
      ))}
    </div>
  );
}

function PlayerStall({ s, beast, onChanged, onNeedsKey }: { s: StallView; beast: Beast; onChanged: () => void; onNeedsKey: () => void }) {
  const stock = useAsync(s.beast_account ? () => getItemBalances(s.beast_account as string) : null, [s.beast_account]);
  const tx = useTx(onNeedsKey);
  const floors = s.rules?.floors ?? {};
  const never = new Set(s.rules?.never_sell ?? []);
  const forSale = (Object.entries(floors) as [Item, string][]).filter(([item, p]) => !never.has(item) && num(p) > 0);
  const dark = s.lanterns <= 0;
  return (
    <article className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold">
          Stall #{s.slot} · <Link href={`/beast/${s.token_id}`} className="text-lantern underline-offset-4 hover:underline">Beast {s.token_id}</Link>
        </h4>
        <Lanterns lit={s.lanterns} size={9} />
      </div>
      {dark && <Notice kind="info">Lights out: this stall missed its rent.</Notice>}
      {forSale.length ? (
        <ul className="flex flex-col gap-1.5">
          {forSale.map(([item, price]) => {
            const left = stock.data?.[item];
            return (
              <li key={item} className="flex items-center gap-2 text-sm">
                <Art slot={`item-${item}`} size={22} alt="" />
                <span className="flex-1">
                  {ITEM_LABEL[item]} <span className="text-xs text-mist">{left !== undefined ? `· ${left} left` : ""}</span>
                </span>
                <span className="font-display text-lantern">{yarn(price)} YARN</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!!tx.pending || dark || left === 0}
                  onClick={async () => {
                    if (await tx.run(`buy-${item}`, () => buyFromStall(beast.token_id, s.slot, item, 1, num(price)), `Bought 1 ${item} from stall #${s.slot}.`)) {
                      stock.reload();
                      onChanged();
                    }
                  }}
                >
                  {tx.pending === `buy-${item}` ? <Spinner /> : null} Buy 1
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mist">Nothing priced for sale yet.</p>
      )}
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
      {stock.error ? <p className="text-xs text-mist">{friendly(stock.error, "Couldn't count this stall's stock.")}</p> : null}
    </article>
  );
}
