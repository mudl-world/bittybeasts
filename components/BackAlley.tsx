"use client";
// Holders-only corner. Gated on owning at least one Beast.
import Link from "next/link";
import { CONFIG, getBeastsForOwner, type Beast } from "@/lib/chain";
import { getLegends } from "@/lib/ui/legends";
import { QUIET } from "@/lib/ui/errors";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "./Art";
import ChainTail from "./ChainTail";
import GoogleSignIn from "./GoogleSignIn";
import { Empty, ExplorerLink, Loading, Pill } from "./ui";

export default function BackAlley() {
  const { session, ready } = useSession();
  const mine = useAsync(session ? () => getBeastsForOwner(session.accountId) : null, [session?.accountId]);

  if (!ready) return <Loading />;
  if (!session)
    return (
      <Gate>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-mist">Already have a Beast? Sign in first.</p>
          <GoogleSignIn />
        </div>
      </Gate>
    );
  if (mine.loading && !mine.data) return <Loading label="Checking for a cat…" />;
  if (mine.error && !mine.data)
    return (
      <Empty title="The gate is stuck" action={<button className="btn btn-ghost btn-sm" onClick={mine.reload}>Try again</button>}>
        {QUIET}
      </Empty>
    );
  if (!mine.data?.length) return <Gate />;
  return <Inside mine={mine.data} />;
}

function Gate({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-6 text-center">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <rect x="14" y="40" width="92" height="76" rx="10" fill="#15123d" stroke="#4b44a3" strokeWidth="3" />
        {[30, 48, 66, 84].map((x) => (
          <rect key={x} x={x} y="46" width="6" height="64" rx="3" fill="#332d7a" />
        ))}
        <path d="M36 40 V28 a24 24 0 0 1 48 0 V40" fill="none" stroke="#6b6399" strokeWidth="6" />
        <circle cx="60" cy="76" r="9" fill="#ffb547" />
        <rect x="57" y="78" width="6" height="14" rx="2" fill="#ffb547" />
      </svg>
      <h1 className="text-4xl font-bold">The Back Alley</h1>
      <p className="text-mist">Behind the bins, past the drainpipe, there&apos;s a gate only Bitty Beasts can slip through.</p>
      <div className="card flex items-center gap-3 p-4 text-left text-sm">
        <Art slot="cat-curious" alt="" size={44} />
        <span>
          <b className="font-display text-base text-paper">Only cats get through.</b>
          <br />
          <span className="text-mist">Adopt a cat in your room and the gate swings open.</span>
        </span>
      </div>
      {children && <div className="w-full text-left">{children}</div>}
    </div>
  );
}

function Inside({ mine }: { mine: Beast[] }) {
  const legends = useAsync(() => getLegends(), []);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-4xl font-bold">The Back Alley</h1>
        <p className="text-mist">
          Welcome in, {mine.map((b) => b.name).join(" & ")}. Mind the puddles.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Studio notes</h3>
            <Pill>placeholder</Pill>
          </div>
          <p className="text-sm text-mist">
            Notes from the studio: why the eyes are so big, how the merchants got their names, and what went wrong with batch three (too much shine,
            very shiny, very sad). The maker will post here.
          </p>
        </div>
        <div className="card flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Next batch: early access</h3>
            <Pill tone="lantern">placeholder</Pill>
          </div>
          <p className="text-sm text-mist">
            Holders hear about new Series first and get a window to claim one before the public drop. Details when the lanterns are lit.
          </p>
          <button className="btn btn-ghost btn-sm self-start" disabled>
            Notify me (soon)
          </button>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-semibold">Hall of Legends</h3>
          <span className="text-xs text-mist">Beasts whose tails turned gold</span>
        </div>
        {legends.loading && !legends.data ? (
          <Loading label="Polishing the plaques…" />
        ) : legends.error && !legends.data ? (
          <p className="text-sm text-mist">{QUIET}</p>
        ) : legends.data?.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {legends.data.map((b) => (
              <li key={b.token_id}>
                <Link href={`/beast/${b.token_id}`} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-legend/30 hover:bg-white/10">
                  <Art slot="cat-happy" size={56} className="rounded-xl" />
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-legend">★ {b.name}</p>
                    <ChainTail lives={b.lives} legend size="sm" />
                    <p className="text-[11px] text-mist">best run {b.best_run} · {b.marks.length} marks</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mist">No legends yet. The first golden tail is still out there.</p>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Alley council</h3>
          <Pill tone="ember">coming soon</Pill>
        </div>
        <p className="text-sm text-mist">
          One Beast, one paw. Holders will vote on the next Series theme and on new events for Lantern Lane. Not live yet: nothing here does
          anything today.
        </p>
        <div className="flex flex-wrap gap-2 opacity-60">
          <button className="btn btn-ghost btn-sm" disabled>
            Series 2: Harbour Cats
          </button>
          <button className="btn btn-ghost btn-sm" disabled>
            Series 2: Rooftop Owls
          </button>
        </div>
        <div className="pt-1">
          <ExplorerLink href={`${CONFIG.explorer}/address/${CONFIG.alley}`}>Alley contract on NEAR</ExplorerLink>
        </div>
      </section>
    </div>
  );
}
