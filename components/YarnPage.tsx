"use client";
// $YARN: the alley's own nine lives. This page may talk about the chain.
import Link from "next/link";
import { useState } from "react";
import { CONFIG, closeNight, getYarnLog, getYarnParams, getYarnState, settleYarn, type YarnLogEntry } from "@/lib/chain";
import { QUIET } from "@/lib/ui/errors";
import { duration, formatDateTime, yarn } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import { useTx } from "./alley/useTx";
import ChainTail from "./ChainTail";
import Countdown from "./Countdown";
import { Bar, Empty, ExplorerLink, Loading, Notice, Pill, Spinner } from "./ui";

const LOG_LABEL: Record<YarnLogEntry["kind"], string> = {
  mint: "Minted",
  burn: "Burned",
  life_lost: "Alley lost a life",
  life_back: "Alley won a life back",
  reset: "Streak reset, lives refilled",
  record: "New Longest Night",
};

export default function YarnPage() {
  const state = useAsync(() => getYarnState(), []);
  const params = useAsync(() => getYarnParams(), []);
  const log = useAsync(() => getYarnLog(0, 200), []);
  const { session, ready } = useSession();
  const tx = useTx();
  const [chartOk, setChartOk] = useState(true);

  const reloadAll = () => {
    state.reload();
    log.reload();
  };

  const st = state.data;
  const pct = st && st.target_tonight > 0 ? Math.min(1, st.tugs_tonight / st.target_tonight) : 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">
          $YARN <span className="text-lantern">· the alley&apos;s nine lives</span>
        </h1>
        <p className="max-w-2xl text-paper/90">
          Over the rooftops hangs the Great Yarn, and every lantern on Lantern Lane hangs from it. $YARN is its thread. Tug it enough
          each night and it spins; neglect it and it unravels. When the alley&apos;s ninth life goes out, the Long Dark ends the Age.{" "}
          <Link href="/ledger" className="text-lantern underline decoration-dotted underline-offset-4">
            The Ages so far →
          </Link>
        </p>
        <p className="max-w-2xl text-mist">
          A NEP-141 token on NEAR with no admin. Every finished prowl and every daily boop gives the alley a tug. If enough Beasts tug in a
          night, fresh YARN is spun for everyone who did. Miss a night and the alley loses a life and a little of the treasury burns. Lose all
          nine and the streak starts over.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <ExplorerLink href={`${CONFIG.explorer}/address/${CONFIG.yarn}`}>{CONFIG.yarn} on NEAR</ExplorerLink>
          <ExplorerLink href={`${CONFIG.explorer}/address/${CONFIG.alley}`}>{CONFIG.alley}</ExplorerLink>
        </div>
      </header>

      {state.loading && !st ? (
        <Loading label="Counting the yarn…" />
      ) : state.error && !st ? (
        <Empty title="Can't reach the $YARN contract" action={<button className="btn btn-ghost btn-sm" onClick={state.reload}>Try again</button>}>
          The contract at {CONFIG.yarn} didn&apos;t answer. It may not be deployed yet on {CONFIG.network}, or the RPC is busy.
        </Empty>
      ) : st ? (
        <>
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
                <p className="text-xs text-mist">{st.lives}/{params.data?.max_lives ?? 9}</p>
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
                {pct >= 1 ? "Target hit: tonight will mint." : `${Math.max(0, st.target_tonight - st.tugs_tonight)} more Beasts need to prowl or boop tonight.`}{" "}
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
        </>
      ) : null}

      <section className="card p-5">
        <h3 className="text-lg font-semibold">Rules</h3>
        <p className="mb-3 text-xs text-mist">Fixed at launch, no admin key. The contract&apos;s full-access key was deleted after init.</p>
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

      {chartOk && ready && (
        <section className="card p-5">
          <h3 className="mb-1 text-lg font-semibold">60 nights, three ways</h3>
          <p className="mb-3 text-xs text-mist">Supply simulation from scripts/simulate-yarn.ts with the same parameters as the contract.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yarn-sim.svg" alt="Simulated $YARN supply over 60 nights in three scenarios" className="w-full rounded-xl bg-paper" onError={() => setChartOk(false)} />
        </section>
      )}

      <section className="card p-5">
        <h3 className="mb-2 text-lg font-semibold">Every mint and burn</h3>
        {log.loading && !log.data ? (
          <Loading />
        ) : log.error && !log.data ? (
          <p className="text-sm text-mist">{QUIET}</p>
        ) : log.data?.length ? (
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
                {[...log.data].reverse().map((e, i) => (
                  <tr key={`${e.night}-${e.kind}-${i}`}>
                    <td className="py-1.5 pr-2 tabular-nums">{e.night}</td>
                    <td className="py-1.5 pr-2">
                      <span className={e.kind === "mint" || e.kind === "life_back" || e.kind === "record" ? "text-moss" : e.kind === "burn" || e.kind === "life_lost" ? "text-[#ffb3a1]" : "text-mist"}>
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
        ) : (
          <p className="text-sm text-mist">No nights settled yet.</p>
        )}
      </section>
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
