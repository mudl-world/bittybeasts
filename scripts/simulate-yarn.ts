// 60-night $YARN supply simulation under three community scenarios.
// Uses the same rules as the contract (lib/economy/yarn.ts).
//
//   ./node_modules/.bin/tsx scripts/simulate-yarn.ts      (or: pnpm tsx scripts/simulate-yarn.ts)
//
// Writes docs/yarn-sim.csv, docs/yarn-sim.svg and docs/yarn-sim.md.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRng, type Rng } from "../lib/economy/rng";
import { depositToTreasury, initialYarnState, settleNight, YARN_RULES, type NightOutcome, type YarnSimState } from "../lib/economy/yarn";

const NIGHTS = 60;
const SEED = 2026;
const STALLS = 12;
const STALL_RENT = 5;
/** Share of circulating YARN that changes paws on the market each night (2% of it is the fee). */
const NIGHTLY_TURNOVER = 0.15;
const MARKET_FEE = 0.02;

type Scenario = {
  id: "steady" | "fading" | "weekend";
  label: string;
  /** Registered Beasts on a given night (1-based). */
  registered: (night: number) => number;
  /** Chance that a registered Beast tugs that night. */
  turnout: (night: number) => number;
};

const SCENARIOS: Scenario[] = [
  {
    id: "steady",
    label: "Steady community",
    registered: (n) => 80 + Math.floor(n / 3), // slow growth: 80 -> 100
    turnout: () => 0.71,
  },
  {
    id: "fading",
    label: "Slowly fading",
    registered: () => 100,
    turnout: (n) => 0.76 - (0.36 * (n - 1)) / (NIGHTS - 1), // 76% -> 40%
  },
  {
    id: "weekend",
    label: "Weekend dips",
    registered: () => 100,
    turnout: (n) => (n % 7 === 6 || n % 7 === 0 ? 0.5 : 0.72), // nights 6 & 7 of each week dip
  },
];

type Row = { night: number; scenario: string; state: YarnSimState; outcome: NightOutcome };

function binomial(rng: Rng, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.chance(p)) k++;
  return k;
}

function run(s: Scenario): Row[] {
  const rng = makeRng(SEED);
  // Genesis, as minted by contracts/yarn `new`: 10,000 YARN treasury + 4 merchant purses of 2,000.
  let state = initialYarnState({ night: 1, total_supply: 18_000, treasury: 10_000 });
  const rows: Row[] = [];
  for (let night = 1; night <= NIGHTS; night++) {
    const registered = s.registered(night);
    const tugs = binomial(rng, registered, s.turnout(night));
    // During the night rent and the 2% market fee flow into the treasury.
    const circulating = state.total_supply - state.treasury;
    const inflow = Math.min(circulating, STALLS * STALL_RENT + Math.floor(circulating * NIGHTLY_TURNOVER * MARKET_FEE));
    state = depositToTreasury(state, inflow);
    const settled = settleNight(state, tugs, registered);
    state = settled.state;
    rows.push({ night, scenario: s.id, state, outcome: settled.outcome });
  }
  return rows;
}

const results = SCENARIOS.map((s) => ({ scenario: s, rows: run(s) }));

// ---- CSV ---------------------------------------------------------------------------
const header = "night,scenario,registered,tugs,target,hit,minted,burned,total_supply,treasury,streak,run,lives,longest,reset,record_broken";
const csv = [header];
for (const { rows } of results) {
  for (const r of rows) {
    const o = r.outcome;
    const st = r.state;
    csv.push([r.night, r.scenario, o.registered, o.tugs, o.target, o.hit ? 1 : 0, o.minted, o.burned, st.total_supply, st.treasury, st.streak, st.run, st.lives, st.longest, o.reset ? 1 : 0, o.recordBroken ? 1 : 0].join(","));
  }
}

// ---- Summary -----------------------------------------------------------------------
type Summary = { id: string; label: string; final: number; minted: number; burned: number; misses: number; resets: number; longest: number; festivals: number; lives: number; streak: number };
const summaries: Summary[] = results.map(({ scenario, rows }) => {
  const last = rows[rows.length - 1].state;
  return {
    id: scenario.id,
    label: scenario.label,
    final: last.total_supply,
    minted: rows.reduce((t, r) => t + r.outcome.minted, 0),
    burned: rows.reduce((t, r) => t + r.outcome.burned, 0),
    misses: rows.filter((r) => !r.outcome.hit).length,
    resets: rows.filter((r) => r.outcome.reset).length,
    longest: last.longest,
    festivals: rows.filter((r) => r.outcome.recordBroken).length,
    lives: last.lives,
    streak: last.streak,
  };
});

// ---- SVG chart ---------------------------------------------------------------------
// Line chart of total supply (one line per scenario, labelled at the line end),
// plus a "night strip" per scenario: a filled cell for a good night, a hollow
// cell for a miss, and an R above the night the alley ran out of lives.
const COLORS: Record<string, string> = { steady: "#2a78d6", fading: "#eb6834", weekend: "#1baf7a" };
const W = 1000;
const plot = { left: 64, right: 760, top: 56, bottom: 330 };
const stripTop = 412;
const stripRow = 34;
const H = stripTop + results.length * stripRow + 40;

const maxSupply = Math.max(...results.flatMap(({ rows }) => rows.map((r) => r.state.total_supply)));
const yMax = Math.ceil(maxSupply / 5000) * 5000;
const x = (night: number) => plot.left + ((night - 1) / (NIGHTS - 1)) * (plot.right - plot.left);
const y = (v: number) => plot.bottom - (v / yMax) * (plot.bottom - plot.top);
const fmt = (n: number) => n.toLocaleString("en-US");

const svg: string[] = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-labelledby="t d">`);
svg.push(`<title id="t">$YARN total supply over 60 nights, three scenarios</title>`);
svg.push(`<desc id="d">${summaries.map((s) => `${s.label}: ends at ${fmt(s.final)} YARN, ${s.misses} missed nights, ${s.resets} resets`).join("; ")}.</desc>`);
svg.push(`<rect width="${W}" height="${H}" fill="#fcfcfb"/>`);
svg.push(`<text x="${plot.left}" y="26" font-size="17" font-weight="600" fill="#0b0b0b">$YARN total supply, 60 nights</text>`);
svg.push(`<text x="${plot.left}" y="44" font-size="12" fill="#52514e">Good night: +10 YARN per tugger. Missed night: -1 alley life, 5% of treasury burned. 0 lives: streak resets.</text>`);

// Grid + y axis
for (let v = 0; v <= yMax; v += yMax / 5) {
  svg.push(`<line x1="${plot.left}" x2="${plot.right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7e6e2" stroke-width="1"/>`);
  svg.push(`<text x="${plot.left - 8}" y="${y(v) + 4}" font-size="11" fill="#6f6e69" text-anchor="end">${fmt(v)}</text>`);
}
for (let n = 1; n <= NIGHTS; n += n === 1 ? 9 : 10) {
  svg.push(`<text x="${x(n)}" y="${plot.bottom + 18}" font-size="11" fill="#6f6e69" text-anchor="middle">${n}</text>`);
}
svg.push(`<text x="${(plot.left + plot.right) / 2}" y="${plot.bottom + 36}" font-size="11" fill="#6f6e69" text-anchor="middle">Night</text>`);

// Lines with direct end labels (nudged apart if they collide).
const ends = results.map(({ scenario, rows }) => ({ id: scenario.id, label: scenario.label, value: rows[rows.length - 1].state.total_supply, ly: y(rows[rows.length - 1].state.total_supply) }));
ends.sort((a, b) => a.ly - b.ly);
for (let i = 1; i < ends.length; i++) if (ends[i].ly - ends[i - 1].ly < 30) ends[i].ly = ends[i - 1].ly + 30;
for (const { scenario, rows } of results) {
  const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.night).toFixed(1)},${y(r.state.total_supply).toFixed(1)}`).join(" ");
  svg.push(`<path d="${d}" fill="none" stroke="${COLORS[scenario.id]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const r of rows.filter((r) => !r.outcome.hit)) {
    svg.push(`<circle cx="${x(r.night)}" cy="${y(r.state.total_supply)}" r="3.5" fill="#fcfcfb" stroke="${COLORS[scenario.id]}" stroke-width="2"><title>${scenario.label}, night ${r.night}: missed, ${r.outcome.burned} YARN burned</title></circle>`);
  }
}
for (const e of ends) {
  svg.push(`<circle cx="${plot.right + 10}" cy="${e.ly - 4}" r="4" fill="${COLORS[e.id]}"/>`);
  svg.push(`<text x="${plot.right + 20}" y="${e.ly}" font-size="12" font-weight="600" fill="#0b0b0b">${e.label}</text>`);
  svg.push(`<text x="${plot.right + 20}" y="${e.ly + 14}" font-size="11" fill="#52514e">${fmt(e.value)} YARN</text>`);
}

// Night strips
svg.push(`<text x="${plot.left}" y="${stripTop - 14}" font-size="12" font-weight="600" fill="#0b0b0b">Night by night</text>`);
svg.push(`<text x="${plot.left + 98}" y="${stripTop - 14}" font-size="11" fill="#52514e">filled = good night, hollow = miss (hollow dots on the lines above), R = out of lives, streak reset</text>`);
const cellW = (plot.right - plot.left) / NIGHTS;
results.forEach(({ scenario, rows }, i) => {
  const top = stripTop + i * stripRow;
  const s = summaries[i];
  svg.push(`<text x="${plot.left - 8}" y="${top + 13}" font-size="11" fill="#52514e" text-anchor="end">${scenario.id}</text>`);
  for (const r of rows) {
    const cx = plot.left + (r.night - 1) * cellW;
    const tip = `${scenario.label}, night ${r.night}: ${r.outcome.tugs}/${r.outcome.registered} tugged (needed ${r.outcome.target}); streak ${r.state.streak}, lives ${r.state.lives}`;
    if (r.outcome.hit) {
      svg.push(`<rect x="${cx + 1}" y="${top + 2}" width="${cellW - 2}" height="14" rx="2" fill="${COLORS[scenario.id]}"><title>${tip}</title></rect>`);
    } else {
      svg.push(`<rect x="${cx + 1.5}" y="${top + 2.5}" width="${cellW - 3}" height="13" rx="2" fill="#fcfcfb" stroke="${COLORS[scenario.id]}" stroke-width="1.5"><title>${tip}; ${r.outcome.burned} YARN burned</title></rect>`);
    }
    if (r.outcome.reset) svg.push(`<text x="${cx + cellW / 2}" y="${top - 1}" font-size="9" font-weight="700" fill="#0b0b0b" text-anchor="middle">R</text>`);
  }
  svg.push(`<text x="${plot.right + 10}" y="${top + 13}" font-size="11" fill="#52514e">longest ${s.longest} · ${s.misses} misses · ${s.resets} reset${s.resets === 1 ? "" : "s"}</text>`);
});
svg.push(`</svg>`);

// ---- Markdown summary ------------------------------------------------------------
const by = Object.fromEntries(summaries.map((s) => [s.id, s])) as Record<string, Summary>;
const md = `# $YARN 60-night supply simulation

Generated by \`scripts/simulate-yarn.ts\` (seed ${SEED}) using the contract rules mirrored in \`lib/economy/yarn.ts\`:
target ${YARN_RULES.target_bps / 100}% of registered Beasts, ${YARN_RULES.mint_per_tug} YARN per tugger on a good night,
${YARN_RULES.burn_bps / 100}% of the treasury burned on a miss, ${YARN_RULES.max_lives} lives, +1 life per ${YARN_RULES.regen_every} consecutive good nights.
Genesis supply 18,000 YARN (10,000 treasury + four 2,000 merchant purses, as in the contract); the treasury fills from stall rent (${STALLS} x ${STALL_RENT} YARN) and the 2% market fee.

![Total supply chart](./yarn-sim.svg)

| Scenario | Final supply | Minted | Burned | Missed nights | Resets | Longest Night | Festivals | Lives / streak at night 60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${summaries.map((s) => `| ${s.label} | ${fmt(s.final)} | ${fmt(s.minted)} | ${fmt(s.burned)} | ${s.misses} | ${s.resets} | ${s.longest} | ${s.festivals} | ${s.lives} / ${s.streak} |`).join("\n")}

**Reading.** A steady community mints on almost every night, so supply climbs in a straight line and the alley keeps its lives (${by.steady.misses} misses, ${by.steady.resets} resets). A slowly fading community stops minting once turnout drops under 60%: supply flattens, the treasury is burned 5% at a time (${fmt(by.fading.burned)} YARN in total) and the alley runs out of lives ${by.fading.resets} time${by.fading.resets === 1 ? "" : "s"}, so its streak resets. Weekend dips cost two lives a week and rarely allow seven good nights in a row to win one back, so even an active-on-weekdays alley eventually resets (${by.weekend.resets} reset${by.weekend.resets === 1 ? "" : "s"}): supply is driven by showing up, not by holding.

Festivals only appear after a reset: the first streak has no Longest Night to beat.
`;

const docs = join(process.cwd(), "docs");
writeFileSync(join(docs, "yarn-sim.csv"), csv.join("\n") + "\n");
writeFileSync(join(docs, "yarn-sim.svg"), svg.join("\n") + "\n");
writeFileSync(join(docs, "yarn-sim.md"), md);

console.log("Scenario            final  minted  burned  misses resets longest");
for (const s of summaries) {
  console.log(`${s.label.padEnd(18)} ${String(s.final).padStart(6)} ${String(s.minted).padStart(7)} ${String(s.burned).padStart(7)} ${String(s.misses).padStart(7)} ${String(s.resets).padStart(6)} ${String(s.longest).padStart(7)}`);
}
console.log("Wrote docs/yarn-sim.csv, docs/yarn-sim.svg, docs/yarn-sim.md");
