"use client";
// The Lantern Ledger: the Lane's nightly paper, the history of its Ages, and the world it's set in.
import Link from "next/link";
import type { Age, Edition, Story } from "@/lib/story/ledger";
import { useLane } from "@/lib/story/useLane";
import { WORLD } from "@/lib/story/world";
import { QUIET } from "@/lib/ui/errors";
import ChainTail from "../ChainTail";
import Countdown from "../Countdown";
import { Empty, Loading, Pill } from "../ui";
import RequestBoard from "./RequestBoard";

const TONE: Record<Story["tone"], string> = {
  good: "text-moss",
  bad: "text-[#ffb3a1]",
  plain: "text-paper",
  legend: "text-lantern",
};

export default function Ledger() {
  const lane = useLane();
  const data = lane.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="font-display text-sm font-medium uppercase tracking-[0.2em] text-lantern">The Lantern Ledger</p>
        <h1 className="text-4xl font-bold">News from Lantern Lane</h1>
        <p className="max-w-2xl text-mist">
          Nobody writes this paper. Each edition is put together from what the cats and merchants actually did that night, so the story
          keeps going whether you play or not.
        </p>
      </header>

      {lane.loading && !data ? (
        <Loading label="The crier is clearing their throat…" />
      ) : lane.error && !data ? (
        <Empty title="The Ledger didn't arrive" action={<button className="btn btn-ghost btn-sm" onClick={lane.reload}>Try again</button>}>
          {QUIET}
        </Empty>
      ) : data ? (
        <>
          <section className="card flex flex-col gap-4 p-5 ring-1 ring-lantern/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-mist">
                  {data.ages[data.ages.length - 1].ordinal} · Night {data.market.night.night}
                </p>
                <h2 className="text-2xl font-bold">{data.ages[data.ages.length - 1].name}</h2>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <ChainTail lives={data.market.yarn.lives} size="sm" label="Alley lives" />
                <span className="text-xs text-mist">
                  Alley lives {data.market.yarn.lives}/9 · streak {data.market.yarn.streak} · Longest Night {data.market.yarn.longest}
                </span>
                <Countdown />
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {data.tonight.map((s, i) => (
                <li key={i} className={`text-sm ${TONE[s.tone]}`}>
                  • {s.text}
                </li>
              ))}
            </ul>
            <div>
              <h3 className="mb-2 font-display text-lg font-semibold">The notice board</h3>
              <RequestBoard requests={data.market.requests} />
              <p className="mt-2 text-xs text-mist">
                The merchants post these themselves, from what&apos;s on their shelves and what came in tonight. Sell toward a request and it
                pays a quarter more.{" "}
                <Link href="/alley?tab=lane" className="underline decoration-dotted underline-offset-4 hover:text-lantern">
                  To the Lane →
                </Link>
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold">Past editions</h2>
            {data.ledger.length ? (
              data.ledger.map((e) => <EditionCard key={e.night} e={e} ages={data.ages} />)
            ) : (
              <p className="text-sm text-mist">Nothing in the archive yet. The first edition comes out when the first night ends.</p>
            )}
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-2xl font-semibold">The Ages of the Lane</h2>
            <p className="text-sm text-mist">{WORLD.longDark}</p>
            <div className="flex flex-col gap-2">
              {[...data.ages].reverse().map((a) => (
                <AgeRow key={a.age} a={a} />
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section id="world" className="card flex flex-col gap-3 p-5">
        <h2 className="text-2xl font-semibold">The world</h2>
        <Lore title="Lantern Lane" text={WORLD.setting} />
        <Lore title="The Great Yarn and $YARN" text={WORLD.greatYarn} />
        <Lore title="Bitty Beasts" text={WORLD.beasts} />
        <Lore title="Nine lives, everywhere" text={WORLD.nineLives} />
        <Lore title="The Gnawers" text={WORLD.gnawers} />
        <Lore title="A Lane that runs itself" text={WORLD.autonomous} />
        <Link href="/story" className="btn btn-ghost btn-sm self-start">
          Watch the cold open again
        </Link>
      </section>
    </div>
  );
}

function EditionCard({ e, ages }: { e: Edition; ages: Age[] }) {
  const age = ages.find((a) => a.age === e.age);
  return (
    <article className="card flex flex-col gap-2 p-4">
      <p className="text-[11px] uppercase tracking-wider text-mist">
        Night {e.night}
        {age ? ` · ${age.ordinal}` : ""}
      </p>
      <p className={`font-display text-lg font-semibold leading-snug ${TONE[e.headline.tone]}`}>{e.headline.text}</p>
      {e.stories.length > 0 && (
        <ul className="flex flex-col gap-1">
          {e.stories.map((s, i) => (
            <li key={i} className={`text-sm ${TONE[s.tone]}`}>
              • {s.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function AgeRow({ a }: { a: Age }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display font-semibold">
          {a.name} {a.toNight === null ? <Pill tone="lantern">now</Pill> : <Pill tone="ember">ended in the Long Dark</Pill>}
        </p>
        <p className="text-xs text-mist">
          {a.ordinal} · nights {a.fromNight}–{a.toNight ?? "…"}
        </p>
      </div>
      <p className="text-xs text-mist sm:text-right">
        {a.goodNights} good · {a.missedNights} missed · best streak {a.longestStreak}
        <br />
        {a.minted.toLocaleString()} YARN spun · {a.burned.toLocaleString()} unravelled{a.festivals ? ` · ${a.festivals} Moon Festival${a.festivals === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

function Lore({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-display font-semibold text-lantern">{title}</h3>
      <p className="text-sm text-mist">{text}</p>
    </div>
  );
}
