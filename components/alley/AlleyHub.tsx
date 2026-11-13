"use client";
// The game hub for the signed-in player's Beast.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bindKey,
  cancelWander,
  getBeastsForOwner,
  getItemBalances,
  getYarnBalance,
  hasBeastKey,
  wander,
  ITEMS,
  type Beast,
} from "@/lib/chain";
import { catSlot, type ArtSlot } from "@/lib/ui/art";
import { QUIET } from "@/lib/ui/errors";
import { ITEM_LABEL, yoctoToNear, yarn } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "../Art";
import DemoKeychain from "../DemoKeychain";
import { moodFor } from "../BeastCard";
import ChainTail from "../ChainTail";
import WorldMenu from "../shell/WorldMenu";
import Countdown from "../Countdown";
import GoogleSignIn from "../GoogleSignIn";
import Prowl from "../Prowl";
import CloveGuide from "../story/CloveGuide";
import { Empty, Loading, Notice, Pill, Spinner } from "../ui";
import Diary from "./Diary";
import LanternLane from "./LanternLane";
import MyStall from "./MyStall";
import { useTx } from "./useTx";

const TABS: { key: "prowl" | "lane" | "stall" | "diary"; label: string; icon: ArtSlot }[] = [
  { key: "prowl", label: "Prowl the rooftops", icon: "ui-missions" },
  { key: "lane", label: "Lantern Lane", icon: "ui-lane" },
  { key: "stall", label: "My stall", icon: "item-lantern" },
  { key: "diary", label: "Diary", icon: "ui-ledger" },
];
type Tab = (typeof TABS)[number]["key"];

export default function AlleyHub() {
  const { session, ready } = useSession();
  if (!ready) return <Loading label="Padding into the alley…" />;
  if (!session)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-bold">The Alley</h1>
        <div className="card flex flex-col gap-4 p-5">
          <p className="text-sm text-mist">Sign in to take your cat out on missions.</p>
          <GoogleSignIn />
        </div>

      </div>
    );
  return <Hub accountId={session.accountId} />;
}

function Hub({ accountId }: { accountId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "prowl";
  const setTab = (t: Tab) => router.replace(`/alley?tab=${t}`, { scroll: false });

  const beasts = useAsync(() => getBeastsForOwner(accountId), [accountId]);
  const [picked, setPicked] = useState<string | null>(null);
  const [needsKeyFor, setNeedsKeyFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [clove, setClove] = useState(false);

  // Escape closes Sister Clove, like any other panel over the scene.
  useEffect(() => {
    if (!clove) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClove(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clove]);

  const list = beasts.data ?? [];
  const beast = list.find((b) => b.token_id === picked) ?? list[0];

  const items = useAsync(beast ? () => getItemBalances(beast.account_id) : null, [beast?.account_id, tick]);
  const balance = useAsync(beast ? () => getYarnBalance(beast.account_id) : null, [beast?.account_id, tick]);

  const reloadBeasts = beasts.reload;
  const refresh = useCallback(() => {
    reloadBeasts();
    setTick((t) => t + 1);
  }, [reloadBeasts]);
  const beastId = beast?.token_id ?? null;
  const onNeedsKey = useCallback(() => setNeedsKeyFor(beastId), [beastId]);
  const needsKey =
    !!beast &&
    ((needsKeyFor === beastId) || (beast.woken && !beast.wander && !hasBeastKey(beast.token_id, beast.controller)));

  if (beasts.loading && !beasts.data) return <Loading label="Looking for your Beast…" />;
  if (beasts.error && !beasts.data)
    return (
      <Empty title="The alley is quiet" action={<button className="btn btn-ghost btn-sm" onClick={beasts.reload}>Try again</button>}>
        {QUIET}
      </Empty>
    );
  if (!beast)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Empty title="No cat yet" action={<Link href="/room" className="btn btn-lantern btn-sm">Go to your room</Link>}>
          A kitten is waiting on your doorstep. Let it in first, then bring it out on missions.
        </Empty>
      </div>
    );

  const scene: ArtSlot = tab === "prowl" ? "alley-bg" : tab === "diary" ? "diary-scene" : tab === "stall" ? "stall-scene" : "hero-bg";
  const ownItems = ITEMS.filter((i) => (items.data?.[i] ?? 0) > 0);

  return (
    <>
      {/* the scene for this tab fills the screen; the Lane is shown at full brightness (it's the town) */}
      <div className="fixed inset-0" aria-hidden>
        {/* pushed back so the characters and panels read first: softened, dimmed, a little desaturated */}
        <Art slot={scene} alt="" className="h-full w-full scale-105 object-cover blur-[3px] brightness-[0.55] saturate-[0.8]" />
        {/* a vignette that keeps the centre (where the cats stand) and darkens the busy edges */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,transparent_25%,rgb(6_5_26/0.75)_80%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-night-950/50 via-transparent to-night-950/60" />
      </div>

      {/* top HUD: no frame, every piece the same 56px height as the Map button */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 p-3 drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)] sm:gap-3 sm:p-4">
        <WorldMenu />
        <Link
          href={`/beast/${beast.token_id}`}
          className="btn btn-ghost btn-sq relative h-14 w-14 shrink-0 overflow-visible p-0"
          aria-label={`${beast.name}'s life story`}
          title={`${beast.name}'s life story`}
        >
          {/* the whole cat, standing in the tile and spilling out of it */}
          <Art
            slot={catSlot(moodFor(beast))}
            alt=""
            className="pointer-events-none absolute left-1/2 max-w-none -translate-x-1/2 drop-shadow-[0_4px_4px_rgba(0,0,0,0.6)]"
            style={{ width: "50px", bottom: "-8px" }}
          />
        </Link>
        <div className="hidden min-w-0 flex-col justify-center sm:flex">
          <div className="flex items-center gap-2">
            <span className="title-3d truncate text-lg">{beast.name}</span>
            {beast.legend && <Pill tone="legend">★ Legend</Pill>}
            {beast.wander && <Pill tone="lantern">wandering</Pill>}
            {beast.woken && beast.lives <= 0 && <Pill tone="ember">resting</Pill>}
          </div>
          <ChainTail lives={beast.lives} legend={beast.legend} size="sm" />
        </div>
        <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="btn btn-ghost pointer-events-none h-14 shrink-0 gap-1.5 px-3 text-lg text-[#ffc93c]" title="YARN in its purse">
            <Art slot="item-yarn" size={28} alt="" />
            {balance.data !== undefined ? yarn(balance.data) : balance.error ? "?" : "…"}
          </span>
          {ownItems.map((i) => (
            <span key={i} className="btn btn-ghost pointer-events-none hidden h-14 shrink-0 gap-1.5 px-3 text-lg md:inline-flex" title={ITEM_LABEL[i]}>
              <Art slot={`item-${i}`} size={28} alt="" /> {items.data?.[i]}
            </span>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden xl:block">
            <Countdown framed />
          </span>
          <DemoKeychain tokenId={beast.token_id} />
          <WanderControls beast={beast} onChanged={refresh} />
        </div>
      </header>
      {list.length > 1 && (
        <div className="no-scrollbar fixed inset-x-0 top-[5.25rem] z-30 flex gap-2 overflow-x-auto px-4">
          {list.map((b) => (
            <button key={b.token_id} onClick={() => setPicked(b.token_id)} className={`btn btn-sm shrink-0 ${b.token_id === beast.token_id ? "btn-lantern" : "btn-ghost"}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* The tab's own panel, in the space between the HUD and the dock (the Lane draws its street
          instead). A short tab is centred in that space rather than clinging to the top; a tall one
          still scrolls from the top as before. */}
      {tab !== "lane" && (
        <main className="fixed inset-x-0 bottom-[6.5rem] top-[7.5rem] z-20 flex flex-col overflow-y-auto px-3 sm:bottom-28 sm:top-28">
          {/* my-auto, not justify-center: it centres a short panel but lets a tall one start at the
              top, where centring would push its first rows above the scrollable area. */}
          <div className={`mx-auto my-auto flex w-full shrink-0 flex-col gap-4 py-2 ${tab === "stall" ? "max-w-[min(100%,110rem)]" : tab === "prowl" ? "max-w-6xl" : "max-w-3xl"}`}>
            {needsKey && <KeyPrompt beast={beast} onBound={() => { setNeedsKeyFor(null); refresh(); }} />}
            {beast.lives <= 0 && (
              <Notice kind="info">{beast.name} is resting with no lives lit. Only safe prowls until a daily cuddle in its room lights a link back.</Notice>
            )}
            <div role="tabpanel">
              {tab === "prowl" && <Prowl beast={beast} onSettled={refresh} onNeedsKey={onNeedsKey} />}
              {tab === "stall" && <MyStall beast={beast} items={items.data} onChanged={refresh} onNeedsKey={onNeedsKey} />}
              {tab === "diary" && <Diary tokenId={beast.token_id} refreshKey={tick} />}
            </div>
          </div>
        </main>
      )}
      {tab === "lane" && (
        <>
          {needsKey && (
            <div className="fixed inset-x-0 top-28 z-30 flex justify-center px-3">
              <div className="w-full max-w-2xl">
                <KeyPrompt beast={beast} onBound={() => { setNeedsKeyFor(null); refresh(); }} />
              </div>
            </div>
          )}
          <LanternLane beast={beast} items={items.data} yarnBalance={balance.data} onChanged={refresh} onNeedsKey={onNeedsKey} />
        </>
      )}

      {/* Sister Clove, called up from the dock. She speaks over a scrim: while she is talking the
          prowl cards and skills behind her are not choices you can make, so they step back. */}
      {clove && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-[6.5rem] sm:pb-28">
          <button
            className="absolute inset-0 cursor-default bg-night-950/80 backdrop-blur-[2px] animate-rise"
            aria-label="Close Sister Clove"
            onClick={() => setClove(false)}
          />
          <div className="relative w-full max-w-2xl animate-rise">
            <button onClick={() => setClove(false)} className="absolute -top-3 right-1 z-10 transition hover:scale-110" aria-label="Close" title="Close">
              <Art slot="ui-close" alt="" size={34} />
            </button>
            <CloveGuide key={beast.token_id} beast={beast} items={items.data} refreshKey={tick} />
          </div>
        </div>
      )}

      {/* bottom dock: back to the room, the four places, and Sister Clove */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4">
        <div role="tablist" className="flex items-center gap-1 drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)] sm:gap-3">
          <Link href="/room" className="flex items-center rounded-2xl border-[3px] border-transparent px-1 py-1.5 transition hover:-translate-y-0.5 hover:bg-white/5" aria-label="Back to your room" title="Back to your room">
            <Art slot="ui-back" alt="" className="h-11 w-11 sm:h-14 sm:w-14" />
          </Link>
          <span className="h-10 w-[3px] rounded bg-[#1a0b2e]" aria-hidden />
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              aria-label={t.label}
              title={t.label}
              onClick={() => setTab(t.key)}
              className={`rounded-2xl border-[3px] px-1 py-1.5 transition ${
                tab === t.key ? "border-[#1a0b2e] bg-[#ffc93c] shadow-[0_3px_0_#1a0b2e]" : "border-transparent hover:-translate-y-0.5 hover:bg-white/5"
              }`}
            >
              {/* The Diary scroll is drawn narrow and tall, so it fits its box by height and reads
                  smaller than the wide icons beside it. Let it overflow a little to match them. */}
              <Art slot={t.icon} alt="" className={`h-11 w-11 sm:h-14 sm:w-14 ${t.icon === "ui-ledger" ? "scale-125" : ""}`} />
            </button>
          ))}
          <span className="h-10 w-[3px] rounded bg-[#1a0b2e]" aria-hidden />
          <button
            onClick={() => setClove((c) => !c)}
            aria-label="Ask Sister Clove"
            title="Ask Sister Clove"
            aria-pressed={clove}
            className={`rounded-2xl border-[3px] px-1 py-1.5 transition ${clove ? "border-[#1a0b2e] bg-[#ffc93c] shadow-[0_3px_0_#1a0b2e]" : "border-transparent hover:-translate-y-0.5 hover:bg-white/5"}`}
          >
            {/* Clove is full-body art. Show her head and shoulders whole — ears included — and let
                the tail fall past the bottom of the tile rather than cropping the top of her head. */}
            <span className="relative block h-11 w-11 overflow-hidden sm:h-14 sm:w-14">
              <Art
                slot="merchant-clove"
                alt=""
                className="absolute left-1/2 top-0 max-w-none -translate-x-1/2"
                style={{ width: "100%" }}
              />
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

function KeyPrompt({ beast, onBound }: { beast: Beast; onBound: () => void }) {
  const tx = useTx();
  return (
    <div className="card flex flex-col gap-3 p-5 ring-1 ring-lantern/40 sm:flex-row sm:items-center">
      <Art slot="cat-curious" size={64} className="shrink-0 rounded-2xl" />
      <div className="flex-1">
        <p className="font-display text-lg font-semibold">Use {beast.name} on this device</p>
        <p className="text-sm text-mist">
          {beast.name} doesn&apos;t recognise this phone yet. Bind it once and you can prowl and trade from here. Your other phone will stop
          working for {beast.name}.
        </p>
        {tx.note && <Notice kind={tx.note.kind} className="mt-2">{tx.note.text}</Notice>}
      </div>
      <button
        className="btn btn-lantern shrink-0"
        disabled={!!tx.pending}
        onClick={async () => {
          if (await tx.run("bind", () => bindKey(beast.token_id), `${beast.name} knows this phone now.`)) onBound();
        }}
      >
        {tx.pending ? <Spinner /> : null} Use this phone
      </button>
    </div>
  );
}

function WanderControls({ beast, onChanged }: { beast: Beast; onChanged: () => void }) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("5");
  const wandering = !!beast.wander;
  const box = useRef<HTMLDivElement | null>(null);

  // A popover should close when you go and do something else: a click outside it, or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Capture, so it still fires when the thing you clicked stops the event itself.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`btn btn-sq h-14 w-14 shrink-0 p-1 ${wandering ? "btn-lantern" : "btn-ghost"}`}
        aria-label={wandering ? `${beast.name} is wandering` : `Let ${beast.name} wander (resale)`}
        title={wandering ? `${beast.name} is wandering` : `Let ${beast.name} wander (resale)`}
        aria-expanded={open}
      >
        <Art slot="ui-signout" alt="" size={40} />
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-3 flex w-[min(88vw,360px)] animate-rise flex-col gap-3 p-4 text-sm">
          {wandering ? (
            <>
              <p className="font-display text-base">
                {beast.name} is wandering, looking for a new home for <span className="text-[#ffc93c]">{yoctoToNear(beast.wander!.price)} NEAR</span>.
              </p>
              <p className="text-xs text-mist">Whoever opens its collar tag link can adopt it. The maker gets 10%.</p>
              <button
                className="btn btn-ghost btn-sm self-start"
                disabled={!!tx.pending}
                onClick={async () => {
                  if (await tx.run("cancel", () => cancelWander(beast.token_id), `${beast.name} came home.`)) {
                    setOpen(false);
                    onChanged();
                  }
                }}
              >
                {tx.pending ? <Spinner /> : null} Call {beast.name} home
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-base">Let {beast.name} wander to a new home</p>
              <div className="flex items-center gap-2">
                <input className="input num w-24 py-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Asking price in NEAR" />
                <span className="font-display">NEAR</span>
                <button
                  className="btn btn-lantern btn-sm"
                  disabled={!!tx.pending || !(Number(price) > 0)}
                  onClick={async () => {
                    if (await tx.run("wander", () => wander(beast.token_id, price), `${beast.name} is wandering. Hand over its collar tag link; the new owner opens it to adopt.`)) {
                      setOpen(false);
                      onChanged();
                    }
                  }}
                >
                  {tx.pending ? <Spinner /> : null} Let wander
                </button>
              </div>
              <p className="text-xs text-mist">While wandering, {beast.name} can&apos;t prowl or change its stall. The maker gets a small share of the adoption.</p>
            </>
          )}
          {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
        </div>
      )}
    </div>
  );
}
