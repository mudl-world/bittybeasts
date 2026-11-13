"use client";
// $YARN: the alley's own nine lives. This page may talk about the chain.
// Four tabs: the numbers tonight, what $YARN is, the supply chart, and the full mint/burn log.
import Link from "next/link";
import { useState } from "react";
import {
  CONFIG,
  closeNight,
  getYarnLog,
  getYarnLogLen,
  getYarnParams,
  getYarnState,
  settleYarn,
  type YarnLogEntry,
} from "@/lib/chain";
import { QUIET } from "@/lib/ui/errors";
import { duration, formatDateTime, yarn } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import { useTx } from "./alley/useTx";
import ChainTail from "./ChainTail";
import Countdown from "./Countdown";
import { Bar, Empty, ExplorerLink, Loading, Notice, Pager, Pill, Spinner, Tabs } from "./ui";

const LOG_LABEL: Record<YarnLogEntry["kind"], string> = {
  mint: "Minted",
  burn: "Burned",
  life_lost: "Alley lost a life",
  life_back: "Alley won a life back",
  reset: "Streak reset, lives refilled",
  record: "New Longest Night",
};

type TabKey = "tonight" | "about" | "chart" | "log";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "tonight", label: "Tonight", hint: "The streak, the lives and tonight's tugs" },
  { key: "about", label: "What $YARN is", hint: "The thread, and the rules fixed at launch" },
  { key: "chart", label: "Supply", hint: "Modelled supply over 60 nights" },
  { key: "log", label: "Mints & burns", hint: "Every settled night" },
];

/** Rows per page in the mint/burn log. */
const PAGE = 20;
/** Entries fetched per request. The contract caps `log` at 500. */
const WINDOW = 200;

export default function YarnPage() {
  const [tab, setTab] = useState<TabKey>("tonight");
  const state = useAsync(() => getYarnState(), []);
  const params = useAsync(() => getYarnParams(), []);
  const { session, ready } = useSession();
  const tx = useTx();
  const [chartOk, setChartOk] = useState(true);

  // The contract pages from the OLDEST entry, so to show the newest first we need the total
  // and then read the last WINDOW entries.
  const logLen = useAsync(() => getYarnLogLen(), []);
  const total = logLen.data ?? 0;
  const from = Math.max(0, total - WINDOW);
  const log = useAsync(logLen.data === undefined ? null : () => getYarnLog(from, WINDOW), [from, logLen.data === undefined]);

  const [page, setPage] = useState(0);

  const reloadAll = () => {
    state.reload();
    logLen.reload();
    log.reload();
  };

  const st = state.data;
  const pct = st && st.target_tonight > 0 ? Math.min(1, st.tugs_tonight / st.target_tonight) : 0;

  // Newest first, then slice the current page.
  const entries = log.data ? [...log.data].reverse() : [];
  const pages = Math.max(1, Math.ceil(entries.length / PAGE));
  // Clamp during render: a reload can shrink the log under the current page.
  const safePage = Math.min(page, pages - 1);
  const shown = entries.slice(safePage * PAGE, safePage * PAGE + PAGE);

  return (
    <div className="flex flex-col gap-5">
      {/* Header on the left, the section rail on the right: the art behind the header is wide and
          empty on that side, so the tabs sit in it instead of under the copy. Stacks on narrow screens. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <header className="flex min-w-0 flex-col gap-2">
          <h1 className="text-4xl font-bold">
            $YARN <span className="text-lantern">· the alley&apos;s nine lives</span>
          </h1>
          <p className="max-w-2xl text-paper/90">
            Over the rooftops hangs the Great Yarn, and every lantern on Lantern Lane hangs from it. $YARN is its thread. Tug it enough
            each night and it spins; neglect it and it unravels.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <ExplorerLink href={`${CONFIG.explorer}/address/${CONFIG.yarn}`}>{CONFIG.yarn} on NEAR</ExplorerLink>
            <ExplorerLink href={`${CONFIG.explorer}/address/${CONFIG.alley}`}>{CONFIG.alley}</ExplorerLink>
          </div>
        </header>
        <div className="shrink-0 sm:w-48">
          <Tabs tabs={TABS} value={tab} onChange={setTab} label="$YARN sections" orientation="vertical" />
        </div>
      </div>

      {/* ---------------------------------------------------------------- tonight */}
      {tab === "tonight" && (
        <div role="tabpanel" id="panel-tonight" aria-labelledby="tab-tonight" className="flex flex-col gap-5">
          {state.loading && !st ? (
            <Loading label="Counting the yarn…" />
          ) : state.error && !st ? (
            <Empty
              title="Can't reach the $YARN contract"
              action={
                <button className="btn btn-ghost btn-sm" onClick={state.reload}>
                  Try again
                </button>
              }
            >
              The contract at {CONFIG.yarn} didn&apos;t answer. It may not be deployed yet on {CONFIG.network}, or the RPC is busy.
            </Empty>
          ) : st ? (
            <section className="card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-mist">Current streak</p>
                  <p className="font-display text-5xl font-bold text-lantern">
                    {st.streak} <span className="text-xl text-mist">night{st.streak === 1 ? "" : "s"}</span>
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <p className="text-xs uppercase tracking-wider text-mist">Alley lives</p>
                  <ChainTail lives={st.lives} max={params.data?.max_lives ?? 9} size="md" label="Alley lives" />
                  <p className="text-xs text-mist">
                    {st.lives}/{params.data?.max_lives ?? 9}
                  </p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    Tonight&apos;s tugs <b className="font-display text-paper">{st.tugs_tonight}</b> / {st.target_tonight}
                  </span>
                  <Countdown />
                </div>
                <Bar value={pct * 100} tone={pct >= 1 ? "green" : "gold"} />
                <p className="mt-1 text-xs text-mist">
                  {pct >= 1
                    ? "Target hit: tonight will mint."
                    : `${Math.max(0, st.target_tonight - st.tugs_tonight)} more Beasts need to prowl or boop tonight.`}{" "}
                  {st.registered_beasts} Beasts registered.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Mini label="The Longest Night" value={`${st.longest} nights`} />
                <Mini label="Treasury" value={`${yarn(st.treasury)} YARN`} />
                <Mini label="Total supply" value={`${yarn(st.total_supply)} YARN`} />
                <Mini label="Night" value={`#${st.night}`} extra={st.festival ? <Pill tone="legend">Moon Festival</Pill> : null} />
              </div>
              {session && (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                  <p className="text-xs text-mist">Anyone can wind the clock. These are public contract calls, signed by your account.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-lantern btn-sm"
                      disabled={!!tx.pending}
                      onClick={async () => {
                        if (await tx.run("settle", () => settleYarn(), "Settled every finished night.")) reloadAll();
                      }}
                    >
                      {tx.pending === "settle" ? <Spinner /> : null} Settle the night
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!!tx.pending}
                      onClick={async () => {
                        if (await tx.run("close", () => closeNight(), "Market night closed: tills and rents checked.")) reloadAll();
                      }}
                    >
                      {tx.pending === "close" ? <Spinner /> : null} Close the market night
                    </button>
                  </div>
                  {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}

      {/* ------------------------------------------------------------------ about */}
      {tab === "about" && (
        <div role="tabpanel" id="panel-about" aria-labelledby="tab-about" className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h3 className="text-lg font-semibold">What $YARN is</h3>
            <p className="max-w-2xl text-sm text-mist">
              A NEP-141 token on NEAR with no admin. Every finished prowl and every daily boop gives the alley a tug. If enough Beasts tug
              in a night, fresh YARN is spun for everyone who did. Miss a night and the alley loses a life and a little of the treasury
              burns. Lose all nine and the streak starts over.
            </p>
            <p className="max-w-2xl text-sm text-mist">
              When the alley&apos;s ninth life goes out, the Long Dark ends the Age.{" "}
              <Link href="/ledger" className="text-lantern underline decoration-dotted underline-offset-4">
                The Ages so far →
              </Link>
            </p>
          </section>

          <section className="card p-5">
            <h3 className="text-lg font-semibold">Rules</h3>
            <p className="mb-3 text-xs text-mist">
              Fixed at launch, no admin key. The contract&apos;s full-access key was deleted after init.
            </p>
            {params.data ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/5">
                  <Row k="Target" v={`${params.data.target_bps / 100}% of registered Beasts tug in a night`} />
                  <Row k="Mint per tug" v={`${yarn(params.data.mint_per_tug)} YARN to each tugger on a good night`} />
                  <Row k="Burn on a miss" v={`${params.data.burn_bps / 100}% of the treasury`} />
                  <Row k="Alley lives" v={`${params.data.max_lives}`} />
                  <Row k="Win a life back" v={`every ${params.data.regen_every} good nights in a row`} />
                  <Row k="Night length" v={duration(params.data.night_ms)} />
                  <Row k="Only caller of tug()" v={params.data.alley} />
                </tbody>
              </table>
            ) : params.error ? (
              <p className="text-sm text-mist">{QUIET}</p>
            ) : (
              <Loading />
            )}
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------ chart */}
      {tab === "chart" && (
        <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart">
          <section className="card p-5">
            <h3 className="mb-1 text-lg font-semibold">60 nights, three ways</h3>
            <p className="mb-3 text-xs text-mist">
              Modelled supply from scripts/simulate-yarn.ts, run with the same parameters as the contract. Not live chain data.
            </p>
            {chartOk && ready ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/yarn-sim.svg"
                alt="Modelled $YARN supply over 60 nights in three scenarios"
                className="w-full rounded-xl bg-paper"
                onError={() => setChartOk(false)}
              />
            ) : (
              <p className="text-sm text-mist">The supply chart isn&apos;t available.</p>
            )}
          </section>
        </div>
      )}

      {/* -------------------------------------------------------------------- log */}
      {tab === "log" && (
        <div role="tabpanel" id="panel-log" aria-labelledby="tab-log">
          <section className="card p-5">
            <h3 className="mb-2 text-lg font-semibold">Every mint and burn</h3>
            {(log.loading || logLen.loading) && !log.data ? (
              <Loading />
            ) : (log.error || logLen.error) && !log.data ? (
              <p className="text-sm text-mist">{QUIET}</p>
            ) : shown.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-xs text-mist">
                      <tr>
                        <th className="py-1 pr-2 font-normal">Night</th>
                        <th className="py-1 pr-2 font-normal">What happened</th>
                        <th className="py-1 pr-2 text-right font-normal">YARN</th>
                        <th className="py-1 pr-2 text-right font-normal">Accounts</th>
                        <th className="py-1 font-normal">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {shown.map((e, i) => (
                        <tr key={`${e.night}-${e.kind}-${page}-${i}`}>
                          <td className="py-1.5 pr-2 tabular-nums">{e.night}</td>
                          <td className="py-1.5 pr-2">
                            <span
                              className={
                                e.kind === "mint" || e.kind === "life_back" || e.kind === "record"
                                  ? "text-moss"
                                  : e.kind === "burn" || e.kind === "life_lost"
                                    ? "text-[#ffb3a1]"
                                    : "text-mist"
                              }
                            >
                              {LOG_LABEL[e.kind] ?? e.kind}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {e.kind === "mint" ? "+" : e.kind === "burn" ? "−" : ""}
                            {yarn(e.amount)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{e.accounts || ""}</td>
                          <td className="py-1.5 text-xs text-mist">{formatDateTime(e.at_ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={safePage} pages={pages} onPage={setPage} total={entries.length} noun="entries" />
                {total > entries.length && (
                  <p className="pt-1 text-xs text-mist">Showing the most recent {entries.length} of {total} entries.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-mist">No nights settled yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-[11px] uppercase tracking-wider text-mist">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
      {extra}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 text-mist">{k}</td>
      <td className="py-1.5 font-medium">{v}</td>
    </tr>
  );
}
