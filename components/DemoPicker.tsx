"use client";
// One-click demo players (testnet). Each comes with a woken Beast and its keychain secret, so
// visitors and judges can prowl, trade, boop and try a resale without an email or a real keychain.
// Each cat is shown as a cat — portrait, lives, best stat, scars, all read from chain — because
// "Play as Mochi" tells a first-time visitor nothing about who they are choosing.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBeast, listDemoAccounts, signInAsDemo, type Beast, type DemoAccount } from "@/lib/chain";
import { catSlot } from "@/lib/ui/art";
import { notifySession } from "@/lib/ui/session";
import Art from "./Art";
import { moodFor } from "./BeastCard";
import ChainTail from "./ChainTail";
import { Loading, Pill, Spinner } from "./ui";

type Row = { demo: DemoAccount; beast: Beast | null };

const STAT_LABEL: Record<string, string> = { speed: "Speed", reach: "Reach", grip: "Grip", luck: "Luck" };

export default function DemoPicker() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listDemoAccounts()
      .then(async (demos) => {
        // Each cat's real state lives on chain, not in demo-accounts.json: read it so the card shows
        // what this cat has actually been through. A cat that won't load still gets a row.
        const out = await Promise.all(
          demos.map(async (demo) => ({
            demo,
            beast: demo.beast ? await getBeast(demo.beast.tokenId).catch(() => null) : null,
          })),
        );
        if (live) setRows(out);
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  if (rows === null) return <Loading label="Waking the demo cats…" />;
  if (rows.length === 0) return <p className="text-sm text-mist">No demo cats are available right now.</p>;

  function pick(row: Row) {
    setPicking(row.demo.accountId);
    signInAsDemo(row.demo);
    notifySession();
    router.push("/room");
  }

  const cats = rows.filter((r) => r.demo.beast);
  const empties = rows.filter((r) => !r.demo.beast);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {cats.map((row) => (
          <CatChoice key={row.demo.accountId} row={row} busy={picking === row.demo.accountId} onPick={() => pick(row)} />
        ))}
      </div>
      {empties.map((row) => (
        <button
          key={row.demo.accountId}
          className="btn btn-ghost w-full"
          disabled={!!picking}
          title="A player with no Beast yet: use it to adopt a wandering Beast from the market"
          onClick={() => pick(row)}
        >
          {picking === row.demo.accountId ? <Spinner /> : null} Start with no cat, and adopt one
        </button>
      ))}
    </div>
  );
}

/** One cat, as a card you can read before choosing it. */
function CatChoice({ row, busy, onPick }: { row: Row; busy: boolean; onPick: () => void }) {
  const { demo, beast } = row;
  const name = beast?.name ?? demo.beast?.name ?? "A cat";
  const stats = beast?.stats;
  // Lead with whatever makes this cat different from the one beside it.
  const best = stats ? (Object.entries(stats) as [string, number][]).reduce((a, b) => (b[1] > a[1] ? b : a)) : null;

  return (
    <button
      onClick={onPick}
      disabled={busy}
      aria-label={`Play as ${name}`}
      className="group flex flex-col items-center gap-1.5 rounded-2xl border-[3px] border-[#1a0b2e] bg-[#2f2370]/70 p-3 text-center transition hover:-translate-y-0.5 hover:bg-[#3a2c85]/80 disabled:opacity-60"
    >
      <div className="relative">
        <Art slot={catSlot(beast ? moodFor(beast) : "neutral")} size={84} alt="" className="rounded-xl transition group-hover:scale-105" />
        {beast?.legend && (
          <span className="absolute -right-1 -top-1">
            <Pill tone="legend">Legend</Pill>
          </span>
        )}
      </div>

      <p className="font-display text-lg font-bold leading-none text-paper">{name}</p>

      {beast ? (
        <>
          <ChainTail lives={beast.lives} max={9} size="sm" label={`${name}'s tail`} />
          <p className="text-[11px] text-mist">
            {beast.lives} of 9 lives
            {beast.marks.length > 0 && ` · ${beast.marks.length} scar${beast.marks.length === 1 ? "" : "s"}`}
          </p>
          {best && (
            <p className="text-[11px] text-lantern">
              Best at {STAT_LABEL[best[0]] ?? best[0]} ({best[1]})
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-mist">Still asleep</p>
      )}

      <span className="mt-0.5 font-display text-xs font-semibold text-lantern">{busy ? "Opening the door…" : "Play as this cat →"}</span>
    </button>
  );
}
