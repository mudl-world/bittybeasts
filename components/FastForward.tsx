"use client";
// Plays simulateWeek(): 7 nights of Lantern Lane in about a minute.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/chain";
import { MERCHANTS, MERCHANT_IDS, type MerchantId } from "@/lib/economy/pricing";
import { DEFAULT_SIM_SEED, simulateWeek, type SimScenario, type SimSnapshot } from "@/lib/economy/sim";
import { merchantSlot } from "@/lib/ui/art";
import { ITEM_LABEL, yarn } from "@/lib/ui/format";
import Art from "./Art";
import ChainTail from "./ChainTail";
import Lanterns from "./Lanterns";
import { Pill } from "./ui";

const STEPS = 12;
const NIGHTS = 7;
const TARGET_MS = 60_000;
const SPEEDS = [0.5, 1, 2, 4] as const;
const ITEM_COLOR: Record<Item, string> = {
  fish: "#6cb4ff",
  button: "#f07aa0",
  bell: "#ffd95e",
  moonstone: "#c3b6ff",
  charm: "#7ed6a0",
  catnip: "#b6e35d",
  lantern: "#ffb547",
  hat: "#d86b8f",
  scarf: "#3d6fb6",
  bow: "#ff5e3a",
  glasses: "#a9a4e0",
};
const SCENARIOS: { key: SimScenario; label: string }[] = [
  { key: "steady", label: "Steady alley" },
  { key: "fading", label: "Fading interest" },
  { key: "weekend", label: "Weekend crowd" },
];

function run(scenario: SimScenario): SimSnapshot[] {
  return Array.from(simulateWeek({ seed: DEFAULT_SIM_SEED, nights: NIGHTS, stepsPerNight: STEPS, scenario }));
}

export default function FastForward() {
  const [scenario, setScenario] = useState<SimScenario>("steady");
  // Deterministic (seeded), so it is safe to compute during render.
  const snaps = useMemo<SimSnapshot[] | null>(() => {
    try {
      return run(scenario);
    } catch {
      return null;
    }
  }, [scenario]);
  const failed = snaps === null;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const feedRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!playing || !snaps) return;
    const every = TARGET_MS / snaps.length / speed;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (i >= snaps.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, every);
    return () => window.clearInterval(id);
  }, [playing, snaps, speed]);

  const total = snaps?.length ?? 1;
  const cur = snaps?.[idx];

  // Fixed y-domains so lines don't jump around while playing.
  const domains = useMemo(() => {
    const price: Record<MerchantId, number> = { tom: 1, miso: 1, bandit: 1, clove: 1 };
    let supply = 1;
    for (const s of snaps ?? []) {
      for (const m of MERCHANT_IDS) for (const v of Object.values(s.prices[m] ?? {})) price[m] = Math.max(price[m], v ?? 0);
      supply = Math.max(supply, s.yarn.supply);
    }
    return { price, supply };
  }, [snaps]);

  const feed = useMemo(() => {
    if (!snaps) return [];
    const out: { key: string; text: string; night: number }[] = [];
    for (let i = 0; i <= idx; i++) snaps[i].feed.forEach((t, j) => out.push({ key: `${i}-${j}`, text: t, night: snaps[i].night }));
    return out.slice(-60).reverse();
  }, [snaps, idx]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [feed.length]);

  if (failed) return <p className="text-mist">The dry run couldn&apos;t play in this browser.</p>;
  if (!snaps || !cur) return <p className="text-mist">Setting up the week…</p>;

  const marks = snaps
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.step === STEPS && i > 0)
    .map(({ s, i }) => {
      const prev = snaps[i - 1].yarn.supply;
      return { i, kind: s.yarn.supply > prev ? "mint" : s.yarn.supply < prev ? "burn" : "flat", delta: s.yarn.supply - prev };
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-lantern" onClick={() => (idx >= total - 1 ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? "Pause" : idx >= total - 1 ? "Replay" : idx === 0 ? "Play the week" : "Play"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setIdx(0); setPlaying(false); }}>
            Restart
          </button>
          <div className="flex items-center gap-1 rounded-full bg-white/5 p-1" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${speed === s ? "bg-lantern text-[#2a1600]" : "text-mist"}`}>
                {s}×
              </button>
            ))}
          </div>
          <select className="input w-auto py-1.5 text-sm" value={scenario} onChange={(e) => { setPlaying(false); setIdx(0); setScenario(e.target.value as SimScenario); }} aria-label="Scenario">
            {SCENARIOS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="ml-auto font-display text-lg font-semibold">
            Night {cur.night} <span className="text-sm text-mist">{cur.step === STEPS ? "· closing up" : `· hour ${cur.step + 1}/${STEPS}`}</span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={idx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
          aria-label="Scrub through the week"
          className="w-full accent-[#ffb547]"
        />
        <div className="flex justify-between text-[10px] text-mist">
          {Array.from({ length: NIGHTS }, (_, n) => (
            <span key={n}>N{n + 1}</span>
          ))}
        </div>
      </div>

      {cur.events.length > 0 && (
        <div className="flex flex-col gap-2">
          {cur.events.map((e) => (
            <div key={e.kind} className="animate-rise rounded-2xl bg-gradient-to-r from-lantern/25 to-ember/15 px-4 py-2.5 ring-1 ring-lantern/40">
              <span className="mr-2 font-display font-semibold uppercase tracking-wider text-lantern">{e.kind.replace(/_/g, " ")}</span>
              <span className="text-sm">{e.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {MERCHANT_IDS.map((id) => {
              const m = cur.merchants.find((x) => x.id === id);
              const meta = MERCHANTS[id];
              return (
                <div key={id} className={`card flex flex-col gap-2 p-3 ${m?.open ? "" : "ring-1 ring-ember/40"}`}>
                  <div className="flex items-center gap-2">
                    <Art slot={merchantSlot(id)} size={40} className={`rounded-xl ${m?.open ? "" : "grayscale"}`} />
                    <div className="flex-1">
                      <p className="font-display font-semibold leading-tight">{meta.name}</p>
                      <p className="text-[11px] text-mist">till {yarn(m?.till ?? 0)} YARN</p>
                    </div>
                    {m?.open ? <Pill tone="moss">open</Pill> : <Pill tone="ember">lights out</Pill>}
                  </div>
                  <Lanterns lit={m?.lanterns ?? 0} size={10} />
                  <PriceChart snaps={snaps} idx={idx} merchant={id} items={meta.trades} max={domains.price[id]} />
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                    {meta.trades.map((it) => (
                      <span key={it} className="flex items-center gap-1">
                        <span className="inline-block h-0.5 w-3 rounded" style={{ background: ITEM_COLOR[it] }} />
                        {ITEM_LABEL[it]} <b className="tabular-nums text-paper">{cur.prices[id]?.[it] ?? 0}</b>
                        {cur.buyPrices?.[id]?.[it] ? <span className="text-mist">/ {cur.buyPrices[id][it]}</span> : null}
                      </span>
                    ))}
                  </div>
                  {cur.reasoning[id] && <p className="rounded-lg bg-night-950/50 px-2 py-1 text-[11px] italic leading-snug text-mist">&ldquo;{cur.reasoning[id]}&rdquo;</p>}
                </div>
              );
            })}
          </div>

          <div className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">$YARN supply</h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-mist">
                <span>
                  supply <b className="text-paper">{yarn(cur.yarn.supply)}</b>
                </span>
                <span>
                  treasury <b className="text-paper">{yarn(cur.yarn.treasury)}</b>
                </span>
                <span>
                  streak <b className="text-paper">{cur.yarn.streak}</b> · longest {cur.yarn.longest}
                </span>
              </div>
            </div>
            <SupplyChart snaps={snaps} idx={idx} max={domains.supply} marks={marks} />
            <div className="flex items-center gap-2 text-xs text-mist">
              <ChainTail lives={cur.yarn.lives} size="sm" label="Alley lives" /> alley lives {cur.yarn.lives}/9
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="text-moss">▲</span> mint (good night)</span>
                <span className="flex items-center gap-1"><span className="text-ember">▼</span> burn (missed night)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="card flex max-h-[720px] flex-col p-4">
          <h3 className="mb-2 text-lg font-semibold">On the Lane</h3>
          <ol ref={feedRef} className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto text-sm" aria-live="polite">
            {feed.map((f) => (
              <li key={f.key} className="feed-line flex gap-2">
                <span className="shrink-0 text-[10px] leading-5 text-mist">N{f.night}</span>
                <span>{f.text}</span>
              </li>
            ))}
            {!feed.length && <li className="text-mist">Press play. The Lane wakes at dusk.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}

const CW = 320;
const CH = 90;

function PriceChart({ snaps, idx, merchant, items, max }: { snaps: SimSnapshot[]; idx: number; merchant: MerchantId; items: Item[]; max: number }) {
  const n = snaps.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * CW;
  const y = (v: number) => CH - 4 - (v / (max * 1.1)) * (CH - 8);
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`${MERCHANTS[merchant].name}'s prices over the week`}>
      {Array.from({ length: NIGHTS - 1 }, (_, k) => (
        <line key={k} x1={x((k + 1) * (STEPS + 1))} x2={x((k + 1) * (STEPS + 1))} y1={0} y2={CH} stroke="#332d7a" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      ))}
      {items.map((it) => {
        const pts: string[] = [];
        for (let i = 0; i <= idx; i++) pts.push(`${x(i).toFixed(1)},${y(snaps[i].prices[merchant]?.[it] ?? 0).toFixed(1)}`);
        return <polyline key={it} points={pts.join(" ")} fill="none" stroke={ITEM_COLOR[it]} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
      <line x1={x(idx)} x2={x(idx)} y1={0} y2={CH} stroke="#ffb547" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SupplyChart({ snaps, idx, max, marks }: { snaps: SimSnapshot[]; idx: number; max: number; marks: { i: number; kind: string; delta: number }[] }) {
  const W2 = 640;
  const H2 = 140;
  const n = snaps.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W2;
  const y = (v: number) => H2 - 10 - (v / (max * 1.08)) * (H2 - 24);
  const pts: string[] = [];
  for (let i = 0; i <= idx; i++) pts.push(`${x(i).toFixed(1)},${y(snaps[i].yarn.supply).toFixed(1)}`);
  const area = `0,${H2} ${pts.join(" ")} ${x(idx).toFixed(1)},${H2}`;
  return (
    <svg viewBox={`0 0 ${W2} ${H2}`} className="h-36 w-full" role="img" aria-label="YARN supply over the week">
      <defs>
        <linearGradient id="supply-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffb547" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: NIGHTS }, (_, k) => (
        <text key={k} x={x(k * (STEPS + 1)) + 4} y={12} fontSize={10} fill="#a9a4e0">
          N{k + 1}
        </text>
      ))}
      <polygon points={area} fill="url(#supply-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#ffb547" strokeWidth={2.5} strokeLinejoin="round" />
      {marks
        .filter((m) => m.i <= idx && m.kind !== "flat")
        .map((m) => {
          const cx = x(m.i);
          const cy = y(snaps[m.i].yarn.supply);
          return m.kind === "mint" ? (
            <g key={m.i}>
              <path d={`M${cx} ${cy - 14} l6 9 h-12 z`} fill="#7ed6a0" />
              <text x={cx} y={cy - 18} fontSize={10} textAnchor="middle" fill="#7ed6a0">+{yarn(m.delta)}</text>
            </g>
          ) : (
            <g key={m.i}>
              <path d={`M${cx} ${cy + 14} l6 -9 h-12 z`} fill="#ff5e3a" />
              <text x={cx} y={cy + 26} fontSize={10} textAnchor="middle" fill="#ff8a6a">{yarn(m.delta)}</text>
            </g>
          );
        })}
    </svg>
  );
}
