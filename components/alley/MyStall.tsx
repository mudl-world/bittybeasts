"use client";
// My Stall: open a slot, set plain-language rules for the Beast's stall agent, pay rent, close.
import { useState } from "react";
import {
  closeStall,
  getHistory,
  getNight,
  getStalls,
  openStall,
  payRent,
  setStallRules,
  ITEMS,
  type Beast,
  type Item,
  type StallRules,
  type StallView,
} from "@/lib/chain";
import { QUIET } from "@/lib/ui/errors";
import { ITEM_LABEL, num, yarn } from "@/lib/ui/format";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "../Art";
import Lanterns from "../Lanterns";
import { Empty, Loading, Notice, Spinner } from "../ui";
import { DiaryList } from "./Diary";
import { useTx } from "./useTx";

type Props = { beast: Beast; items: Record<Item, number> | undefined; onChanged: () => void; onNeedsKey: () => void };

export default function MyStall({ beast, items, onChanged, onNeedsKey }: Props) {
  const stalls = useAsync(() => getStalls(), []);
  const night = useAsync(() => getNight(), []);
  const history = useAsync(() => getHistory(beast.token_id, 0, 200), [beast.token_id]);
  const tx = useTx(onNeedsKey);
  const refresh = () => {
    stalls.reload();
    history.reload();
    onChanged();
  };

  if (stalls.loading && !stalls.data) return <Loading label="Finding your stall…" />;
  if (stalls.error && !stalls.data)
    return (
      <Empty title="The Lane is dark" action={<button className="btn btn-ghost btn-sm" onClick={stalls.reload}>Try again</button>}>
        {QUIET}
      </Empty>
    );

  const all = stalls.data ?? [];
  const mine = all.find((s) => s.token_id === beast.token_id);
  const rent = night.data?.rent;
  const blocked = !!beast.wander;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-mist">
        Your stall sells while you sleep. {beast.name} follows your rules{rent ? <> · rent is <b className="text-paper">{yarn(rent)} YARN</b> a night</> : null}.
      </p>
      {blocked && <Notice kind="info">{beast.name} is wandering, so the stall can&apos;t be changed right now.</Notice>}

      {/* The stall on the left, its receipts on the right: both fit without scrolling past one to
          reach the other, and the receipts column scrolls on its own when it is long. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
      <div className="flex h-full flex-col gap-4 [&>.card]:h-full">
      {!mine ? (
        <div className="card flex flex-col gap-3 p-5">
          <h3 className="text-lg font-semibold">Open a stall on Lantern Lane</h3>
          <p className="text-sm text-mist">Pick a free slot. Each stall has nine lanterns; miss a night&apos;s rent and one goes out.</p>
          {all.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {all.map((s) => {
                const free = !s.token_id;
                return (
                  <button
                    key={s.slot}
                    className={`btn btn-sm w-full ${free ? "btn-lantern" : "btn-ghost"}`}
                    disabled={!free || !!tx.pending || blocked}
                    onClick={async () => {
                      if (await tx.run(`open-${s.slot}`, () => openStall(beast.token_id, s.slot), `Stall #${s.slot} is yours. Set your rules and pay some rent.`)) refresh();
                    }}
                    title={free ? "Free" : `Taken by Beast ${s.token_id}`}
                  >
                    {tx.pending === `open-${s.slot}` ? <Spinner /> : null}#{s.slot}
                    {!free && <span className="block text-[0.7em] opacity-80">taken</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-mist">No stall slots set up yet.</p>
          )}
          {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
        </div>
      ) : (
        <>
          <StallHeader stall={mine} rent={rent} beast={beast} tx={tx} onChanged={refresh} />
          <RulesEditor stall={mine} beast={beast} items={items} onChanged={refresh} onNeedsKey={onNeedsKey} disabled={blocked} />
        </>
      )}

      </div>

      <div className="card flex h-full max-h-[min(70dvh,640px)] flex-col p-4 sm:p-5">
        <h3 className="mb-2 shrink-0 text-lg font-semibold">Receipts</h3>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {history.data ? (
            <DiaryList entries={history.data} filter={(e) => /stall|rent|sale|sold|sell|buy|bought|revive|trade/i.test(`${e.kind} ${e.text}`)} />
          ) : history.error ? (
            <p className="text-sm text-mist">{QUIET}</p>
          ) : (
            <Loading label="Reading receipts…" />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function StallHeader({ stall, rent, beast, tx, onChanged }: { stall: StallView; rent: string | undefined; beast: Beast; tx: ReturnType<typeof useTx>; onChanged: () => void }) {
  const [typed, setAmount] = useState<string | null>(null);
  const amount = typed ?? rent ?? "5";
  const [confirmClose, setConfirmClose] = useState(false);
  const nightsCovered = rent && num(rent) > 0 ? Math.floor(num(stall.rent_paid) / num(rent)) : null;
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Stall #{stall.slot}</h3>
        <Lanterns lit={stall.lanterns} size={14} />
      </div>
      <p className="text-sm text-mist">
        Rent paid ahead: <b className="text-paper">{yarn(stall.rent_paid)} YARN</b>
        {nightsCovered !== null ? ` (about ${nightsCovered} night${nightsCovered === 1 ? "" : "s"})` : ""} · {stall.lanterns}/9 lanterns lit
      </p>
      {stall.lanterns <= 0 && <Notice kind="info">Lights out. Pay rent to relight the stall.</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input num w-28" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Rent in YARN" />
        <button
          className="btn btn-lantern btn-sm"
          disabled={!!tx.pending || !num(amount)}
          onClick={async () => {
            if (await tx.run("rent", () => payRent(beast.token_id, num(amount)), `Paid ${amount} YARN rent.`)) onChanged();
          }}
        >
          {tx.pending === "rent" ? <Spinner /> : null} Pay rent
        </button>
        <span className="flex-1" />
        {confirmClose ? (
          <>
            <span className="text-xs text-mist">Pack up the stall?</span>
            <button
              className="btn btn-danger btn-sm"
              disabled={!!tx.pending}
              onClick={async () => {
                if (await tx.run("close", () => closeStall(beast.token_id), "Stall packed up.")) onChanged();
                setConfirmClose(false);
              }}
            >
              {tx.pending === "close" ? <Spinner /> : null} Yes, close
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClose(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClose(true)}>
            Close stall
          </button>
        )}
      </div>
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
    </div>
  );
}

type Draft = { floors: Record<Item, string>; never: Record<Item, boolean>; buyBelow: Record<Item, string>; budget: string };

function draftFrom(rules: StallRules | null): Draft {
  const blank = () => Object.fromEntries(ITEMS.map((i) => [i, ""])) as Record<Item, string>;
  const floors = blank();
  const buyBelow = blank();
  const never = Object.fromEntries(ITEMS.map((i) => [i, false])) as Record<Item, boolean>;
  for (const i of ITEMS) {
    floors[i] = rules?.floors?.[i] ?? "";
    buyBelow[i] = rules?.buy_below?.[i] ?? "";
    never[i] = rules?.never_sell?.includes(i) ?? false;
  }
  return { floors, never, buyBelow, budget: rules?.nightly_budget ?? "" };
}

function rulesFrom(d: Draft): StallRules {
  const floors: Partial<Record<Item, string>> = {};
  const buy_below: Partial<Record<Item, string>> = {};
  const never_sell: Item[] = [];
  for (const i of ITEMS) {
    if (d.never[i]) never_sell.push(i);
    else if (num(d.floors[i]) > 0) floors[i] = String(num(d.floors[i]));
    if (num(d.buyBelow[i]) > 0) buy_below[i] = String(num(d.buyBelow[i]));
  }
  const rules: StallRules = { floors, never_sell };
  if (Object.keys(buy_below).length) rules.buy_below = buy_below;
  if (num(d.budget) > 0) rules.nightly_budget = String(num(d.budget));
  return rules;
}

function RulesEditor({
  stall,
  beast,
  items,
  onChanged,
  onNeedsKey,
  disabled,
}: {
  stall: StallView;
  beast: Beast;
  items: Record<Item, number> | undefined;
  onChanged: () => void;
  onNeedsKey: () => void;
  disabled: boolean;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(stall.rules));
  const tx = useTx(onNeedsKey);
  const digits = (v: string) => v.replace(/\D/g, "");

  return (
    <div className="card flex flex-col gap-3 p-5">
      <h3 className="text-lg font-semibold">{beast.name}&apos;s rules</h3>
      <p className="text-sm text-mist">
        Plain and simple. {beast.name} haggles for you, but never goes below your floor, never sells what you&apos;ve marked keep, and only
        buys bargains within tonight&apos;s budget.
      </p>
      <div className="flex flex-col divide-y divide-white/5">
        {ITEMS.map((item) => (
          <div key={item} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
            <div className="flex w-40 items-center gap-2">
              <Art slot={`item-${item}`} size={24} alt="" />
              <span className="font-display font-semibold">{ITEM_LABEL[item]}</span>
              <span className="text-xs text-mist">×{items?.[item] ?? 0}</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className={d.never[item] ? "text-mist/50" : "text-mist"}>Sell for at least</span>
              <input
                className="input w-20 py-1"
                inputMode="numeric"
                placeholder="—"
                disabled={d.never[item]}
                value={d.floors[item]}
                onChange={(e) => setD({ ...d, floors: { ...d.floors, [item]: digits(e.target.value) } })}
              />
              <span className="text-xs text-mist">YARN</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[#ffb547]"
                checked={d.never[item]}
                onChange={(e) => setD({ ...d, never: { ...d.never, [item]: e.target.checked } })}
              />
              <span className="text-mist">Never sell</span>
            </label>
            <label className="flex items-center gap-2 text-sm sm:ml-auto">
              <span className="text-mist">Buy if under</span>
              <input
                className="input w-20 py-1"
                inputMode="numeric"
                placeholder="—"
                value={d.buyBelow[item]}
                onChange={(e) => setD({ ...d, buyBelow: { ...d.buyBelow, [item]: digits(e.target.value) } })}
              />
            </label>
          </div>
        ))}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-mist">Spend at most</span>
        <input className="input num w-24 py-1" inputMode="numeric" placeholder="0" value={d.budget} onChange={(e) => setD({ ...d, budget: digits(e.target.value) })} />
        <span className="text-mist">YARN a night on bargains</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-lantern"
          disabled={!!tx.pending || disabled}
          onClick={async () => {
            if (await tx.run("rules", () => setStallRules(beast.token_id, rulesFrom(d)), `Rules pinned to stall #${stall.slot}.`)) onChanged();
          }}
        >
          {tx.pending === "rules" ? <Spinner /> : null} Save rules
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setD(draftFrom(stall.rules))} disabled={!!tx.pending}>
          Reset
        </button>
      </div>
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
    </div>
  );
}
