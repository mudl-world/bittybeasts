"use client";
// The cat room: the AI Tamagotchi. Your cat lives here. Feed it, dress it, talk to it (NEAR AI,
// verified, paid in its own YARN), then take it out on nine-lives missions.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  adoptKitten,
  bindKey,
  buyThoughts,
  COSMETICS,
  cuddle,
  CONFIG,
  dressBeast,
  feedBeast,
  getBeastsForOwner,
  getCare,
  getItemBalances,
  getThoughts,
  getYarnBalance,
  hasBeastKey,
  setPersona,
  talkToCat,
  type Beast,
  type Care,
  type Cosmetic,
  type TalkResult,
} from "@/lib/chain";
import { catSlot, type ArtSlot, type Expression } from "@/lib/ui/art";
import { QUIET } from "@/lib/ui/errors";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "../Art";
import ChainTail from "../ChainTail";
import GoogleSignIn from "../GoogleSignIn";
import ColdOpen, { introSeen } from "../story/ColdOpen";
import Dialog, { Spoken } from "../Dialog";
import DemoPicker from "../DemoPicker";
import { useTx } from "../alley/useTx";
import { Bar, Empty, Loading, Notice, Pill, Spinner } from "../ui";
import Cover from "../shell/Cover";
import WorldMenu from "../shell/WorldMenu";
import RoomStage, { ROOM_RATIO, type CatAnim } from "./RoomStage";

type Sheet = null | "feed" | "wardrobe" | "talk" | "persona" | "proof";
type Verified = Extract<TalkResult, { ok: true }>;

const PURRS = ["*purrs*", "*headbutts your hand*", "*slow blink*", "*rolls over*", "Mrrrp!", "*kneads the cushion*"];

export default function CatRoom() {
  const { session, ready } = useSession();
  const [intro, setIntro] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setIntro(!introSeen());
  }, []);
  if (!ready || intro === null)
    return (
      <Overlay>
        <Loading label="Opening the door…" />
      </Overlay>
    );
  if (intro)
    return (
      <Overlay wide>
        <ColdOpen doneLabel="Into your room" onDone={() => setIntro(false)} />
      </Overlay>
    );
  if (!session) return <Gate />;
  return <Room accountId={session.accountId} />;
}

/** The sign-in gate. The room is the backdrop, not a wallpaper behind a small box: the two ways in
    sit side by side across the screen, so the art stays visible and nothing has to wrap. */
function Gate() {
  // Two steps, because they are two different decisions: first how you want to play (your own cat
  // or a borrowed one), then — only if borrowing — which cat. Showing five named cats up front
  // asked people to choose between strangers.
  const [step, setStep] = useState<"choose" | "demo">("choose");
  return (
    <>
      <Cover ratio={ROOM_RATIO}>
        <Art slot="room-bg" alt="" className="h-full w-full object-cover" />
      </Cover>
      <div className="fixed inset-0 bg-night-950/60" />
      <div className="fixed left-3 top-3 z-40 sm:left-5 sm:top-5">
        <WorldMenu />
      </div>
      <div className="fixed inset-0 z-30 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-6 px-4 py-20 sm:px-8">
          <header className="text-center">
            <h1 className="title-3d title-3d-light text-4xl sm:text-5xl">
              {step === "choose" ? "Your cat is waiting" : "Pick a cat to borrow"}
            </h1>
            {/* The art behind this is busy, so the line carries its own shadow rather than relying on it. */}
            <p className="mt-2 text-paper/90 [text-shadow:0_2px_6px_rgb(6_5_26/0.95)]">
              {step === "choose"
                ? "Start your own cat, or borrow one and look around first."
                : "These live on testnet and are shared, so expect other paws on them. You can start your own later."}
            </p>
          </header>

          {step === "choose" ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="card flex h-full flex-col gap-4 p-5 text-center">
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Art slot="cat-happy" size={110} alt="" className="rounded-2xl" />
                  <div>
                    <h3 className="text-lg font-semibold">Start your own cat</h3>
                    <p className="mt-1 text-sm text-mist">A kitten of your own moves in, and remembers you. Nothing to install.</p>
                  </div>
                </div>
                <GoogleSignIn label="Continue with Google" />
              </div>

              <div className="card flex h-full flex-col gap-4 p-5 text-center">
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Art slot="ui-lane" size={110} alt="" className="rounded-2xl" />
                  <div>
                    <h3 className="text-lg font-semibold">Borrow a cat</h3>
                    <p className="mt-1 text-sm text-mist">Look around straight away with a cat that already has a life behind it.</p>
                  </div>
                </div>
                <button className="btn btn-ghost w-full" onClick={() => setStep("demo")}>
                  See the cats →
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Above the cats, so the way out is visible without scrolling past them. */}
              <button className="btn btn-ghost btn-sm self-start" onClick={() => setStep("choose")}>
                ← Back
              </button>
              <div className="card flex flex-col gap-4 p-5">
                <DemoPicker />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** The empty attic behind a floating panel: for adopting, loading and the story. */
function Overlay({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <Cover ratio={ROOM_RATIO}>
        <Art slot="room-bg" alt="" className="h-full w-full object-cover" />
      </Cover>
      <div className="fixed inset-0 bg-night-950/55 backdrop-blur-[3px]" />
      <div className="fixed left-3 top-3 z-40 sm:left-5 sm:top-5">
        <WorldMenu />
      </div>
      <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto p-4 pt-20">
        <div className={`flex w-full flex-col gap-4 ${wide ? "max-w-4xl" : "glass max-w-lg p-5"}`}>{children}</div>
      </div>
    </>
  );
}

function Room({ accountId }: { accountId: string }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const beasts = useAsync(() => getBeastsForOwner(accountId), [accountId, tick]);
  const beast = beasts.data?.find((b) => b.woken && !b.wander) ?? beasts.data?.[0];

  if (beasts.loading && !beasts.data)
    return (
      <Overlay>
        <Loading label="Looking for your cat…" />
      </Overlay>
    );
  if (beasts.error && !beasts.data)
    return (
      <Overlay>
        <Empty title="The room is dark">{QUIET}</Empty>
      </Overlay>
    );
  if (!beast)
    return (
      <Overlay>
        <AdoptKitten onDone={refresh} />
      </Overlay>
    );
  return <RoomFor beast={beast} tick={tick} refresh={refresh} />;
}

// ---------------------------------------------------------------- a new player's kitten

function AdoptKitten({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const tx = useTx();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Art slot="cat-sleepy" size={150} />
        <h1 className="text-3xl font-bold">A kitten is curled up on your doorstep</h1>
        <p className="text-mist">
          It has nine lives, its own little purse, and a mind of its own. Give it a name and let it in.
        </p>
        <input className="input max-w-xs text-center" placeholder="Name (or leave it to fate)" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn-lantern"
          disabled={!!tx.pending}
          onClick={async () => {
            if (await tx.run("adopt", () => adoptKitten(name), "Your kitten opened its eyes.")) onDone();
          }}
        >
          {tx.pending ? <Spinner /> : null} Let it in
        </button>
        {tx.pending && <p className="text-xs text-mist">Making a home for it on the Lane (about 10 seconds)…</p>}
        {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the room

/** Fullness and happiness keep falling between refreshes (same rates as the contract). */
function useLiveCare(care: Care | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!care) return undefined;
  const dt = Math.max(0, now - care.at_ms);
  return {
    ...care,
    fullness: Math.max(0, care.fullness - Math.floor(dt / 60_000)),
    happiness: Math.max(0, care.happiness - Math.floor(dt / 90_000)),
  };
}

function expressionFor(anim: CatAnim, fullness: number, happiness: number, lives: number): Expression {
  if (anim === "pet") return "happy";
  if (anim === "eat") return "eat";
  if (anim === "talk") return "talk";
  if (lives === 0) return "sleepy";
  if (fullness < 25) return "angry";
  if (happiness < 30) return "sleepy";
  if (happiness > 75) return "happy";
  return "neutral";
}

const TAP_LINES: { pose: Expression; line: string }[] = [
  { pose: "happy", line: "*purrs*" },
  { pose: "happy", line: "*headbutts your hand*" },
  { pose: "surprised", line: "Mrrp?!" },
  { pose: "curious", line: "…what do you want?" },
  { pose: "angry", line: "HEY. Enough poking!" },
];

/**
 * Keeps the cat alive between actions: idle glances, dozing off when ignored, reactions that build up
 * with repeated taps, and a flapping mouth while it talks (with the reply typed out).
 */
function useCatLife() {
  const [pose, setPose] = useState<Expression | null>(null);
  const [dozing, setDozing] = useState(false);
  const [talking, setTalking] = useState(false);
  const [mouth, setMouth] = useState(false);
  const lastTouch = useRef(0);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef<{ n: number; at: number }>({ n: 0, at: 0 });

  const flash = useCallback((p: Expression, ms = 1400) => {
    setPose(p);
    if (poseTimer.current) clearTimeout(poseTimer.current);
    poseTimer.current = setTimeout(() => setPose(null), ms);
  }, []);

  const touch = useCallback(() => {
    lastTouch.current = Date.now();
    setDozing(false);
  }, []);

  // Idle life: look around now and then; doze off after 30 seconds alone.
  useEffect(() => {
    lastTouch.current = Date.now(); // the room just opened
    const t = setInterval(() => {
      if (Date.now() - lastTouch.current > 30_000) {
        setDozing(true);
        return;
      }
      const r = Math.random();
      if (r < 0.3) flash("curious", 1300);
      else if (r < 0.4) flash("surprised", 700);
      else if (r < 0.55) flash("happy", 1100);
    }, 3800);
    return () => clearInterval(t);
  }, [flash]);

  // Mouth flaps while talking.
  useEffect(() => {
    if (!talking) return;
    const t = setInterval(() => setMouth((m) => !m), 170);
    return () => clearInterval(t);
  }, [talking]);

  /** A tap on the cat: reactions build up the more you poke within a few seconds. */
  const tap = useCallback(() => {
    touch();
    const now = Date.now();
    taps.current = now - taps.current.at < 2500 ? { n: taps.current.n + 1, at: now } : { n: 1, at: now };
    const step = TAP_LINES[Math.min(taps.current.n, TAP_LINES.length) - 1];
    flash(step.pose, step.pose === "angry" ? 2200 : 1400);
    if (step.pose === "angry") taps.current = { n: 0, at: 0 };
    return step;
  }, [flash, touch]);

  return { pose, dozing, talking: talking ? (mouth ? "talk" : "neutral") : null, setTalking, flash, touch, tap } as const;
}

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/\*[^*]+\*/g, ""));
    u.pitch = 1.9;
    u.rate = 1.12;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* no speech on this device */
  }
}

function RoomFor({ beast, tick, refresh }: { beast: Beast; tick: number; refresh: () => void }) {
  const id = beast.token_id;
  const care = useAsync(() => getCare(id), [id, tick]);
  const items = useAsync(() => getItemBalances(beast.account_id), [beast.account_id, tick]);
  const balance = useAsync(() => getYarnBalance(beast.account_id), [beast.account_id, tick]);
  const thoughts = useAsync(() => getThoughts(id, 6), [id, tick]);
  const live = useLiveCare(care.data);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [anim, setAnim] = useState<CatAnim>("idle");
  const [hearts, setHearts] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [proof, setProof] = useState<Verified | null>(null);
  const [voice, setVoice] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tx = useTx(() => setNeedsKey(true));
  const life = useCatLife();
  const typer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Types the cat's line into the bubble with its mouth moving, then stops. */
  const { touch, setTalking } = life;
  const say = useCallback(
    (text: string) => {
      if (typer.current) clearInterval(typer.current);
      setDismissed(null);
      touch();
      setTalking(true);
      let i = 0;
      typer.current = setInterval(() => {
        i = Math.min(text.length, i + 2);
        setBubble(text.slice(0, i));
        if (i >= text.length) {
          if (typer.current) clearInterval(typer.current);
          setTimeout(() => setTalking(false), 350);
        }
      }, 45);
    },
    [touch, setTalking],
  );

  const play = useCallback((a: CatAnim, ms = 1600) => {
    setAnim(a);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim("idle"), ms);
  }, []);

  // The last thing the cat said, when you walk in.
  const last = thoughts.data?.[thoughts.data.length - 1];
  const shown = bubble ?? (last ? last.reply : `${beast.name} looks up at you. *blinks*`);

  const fullness = live?.fullness ?? 70;
  const happiness = live?.happiness ?? 70;
  const credits = care.data?.thought_credits ?? 0;
  const outfit = (care.data?.outfit ?? []).filter((o): o is Cosmetic => (COSMETICS as readonly string[]).includes(o));
  const keyMissing = needsKey || !hasBeastKey(id, beast.controller);

  const pet = () => {
    setDismissed(null);
    const step = life.tap();
    if (step.pose === "happy") {
      setHearts((h) => h + 1);
      play("pet");
    }
    const line = step.pose === "happy" ? PURRS[Math.floor(Math.random() * PURRS.length)] : step.line;
    setBubble(line);
    setProof(null);
    if (voice) speak(step.pose === "happy" ? "prrrrr" : line);
  };

  const expression: Expression =
    life.talking ?? (life.dozing ? "sleepy" : anim !== "idle" ? expressionFor(anim, fullness, happiness, beast.lives) : (life.pose ?? expressionFor(anim, fullness, happiness, beast.lives)));

  const toggle = (k: Exclude<Sheet, null>) => setSheet(sheet === k ? null : k);
  const line = life.dozing && !life.talking ? "Zzz… *twitches a whisker*" : shown;
  // The needs ride in the dialog while it is up, and fall back to the HUD when it is not, so they
  // are always on screen exactly once.
  const speaking = !sheet && line !== dismissed;

  return (
    <>
      {/* the scene: the attic fills the screen, the cat stands on the rug */}
      <Cover ratio={ROOM_RATIO}>
        <RoomStage
          expression={expression}
          outfit={outfit}
          anim={anim}
          bubble={null}
          hearts={hearts}
          onTapCat={pet}
          bubbleBadge={
            proof ? (
              <button className="text-xs font-semibold text-moss underline decoration-dotted underline-offset-2" onClick={() => setSheet("proof")}>
                <span className="inline-flex items-center gap-1">
                  <Art slot="ui-verified" size={16} alt="" /> {proof.verified ? "verified thought" : "unverified"} · NEAR AI
                </span>
              </button>
            ) : null
          }
        />
      </Cover>

      {/* top HUD: no frames, every piece the same 56px height as the Map button (as in the alley) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center gap-2 p-3 drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)] sm:gap-3 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <WorldMenu />
          <Link
            href={`/beast/${beast.token_id}`}
            className="btn btn-ghost btn-sq relative h-14 w-14 shrink-0 overflow-visible p-0"
            aria-label={`${beast.name}'s life story`}
            title={`${beast.name}'s life story`}
          >
            {/* the whole cat, standing in the tile and spilling out of it (as in the alley) */}
            <Art
              slot={catSlot(expression)}
              alt=""
              className="pointer-events-none absolute left-1/2 max-w-none -translate-x-1/2 drop-shadow-[0_4px_4px_rgba(0,0,0,0.6)]"
              style={{ width: "50px", bottom: "-8px" }}
            />
          </Link>
          {/* Name and tail. The needs sit here only when the cat is not speaking: while the dialog
              is up they ride in it instead, so they never appear twice. */}
          <div className="flex h-14 min-w-0 flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="title-3d truncate text-lg sm:text-xl">{beast.name}</span>
              {/* The tail is the first thing to go when the row is tight: the name matters more. */}
              <span className="hidden sm:inline-flex">
                <ChainTail lives={beast.lives} size="sm" legend={beast.legend} />
              </span>
            </div>
          </div>
          {!speaking && (
            <div className="hidden h-14 flex-col justify-center gap-1 md:flex">
              <MiniNeed label="Fullness" value={fullness} color="bg-lantern" warn={fullness < 25 ? "hungry" : undefined} />
              <MiniNeed label="Happiness" value={happiness} color="bg-moss" warn={happiness < 30 ? "lonely" : undefined} />
            </div>
          )}
        </div>
        <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="btn btn-ghost pointer-events-none h-14 shrink-0 gap-1.5 px-3 text-lg text-[#ffc93c]" title="YARN in your cat's purse" aria-label="YARN">
            <Art slot="item-yarn" size={28} alt="" /> {balance.data !== undefined ? balance.data : "…"}
          </span>
          <span
            className="btn btn-ghost pointer-events-none hidden h-14 shrink-0 gap-1.5 px-3 text-lg sm:inline-flex"
            title="Thoughts: each thing your cat says costs one (1 YARN, paid from its own purse)"
            aria-label="Thoughts"
          >
            <Art slot="ui-thought" size={28} alt="" /> {credits}
          </span>
          <button
            className="btn btn-ghost btn-sq h-14 w-14 p-1"
            onClick={() => setVoice((v) => !v)}
            aria-pressed={voice}
            aria-label={voice ? "Mute your cat" : "Let your cat speak out loud"}
            title={voice ? "Mute your cat" : "Let your cat speak out loud"}
          >
            <Art slot={voice ? "ui-sound-on" : "ui-sound-off"} alt="" size={40} />
          </button>
        </div>
      </header>

      {/* this device isn't the cat's controller yet */}
      {keyMissing && (
        <div className="glass fixed left-1/2 top-28 z-40 flex w-[min(92vw,520px)] -translate-x-1/2 flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">{beast.name} doesn&apos;t recognise this device yet. Bind it once to feed, dress and talk from here.</p>
          <button
            className="btn btn-lantern btn-sm"
            disabled={!!tx.pending}
            onClick={async () => {
              if (await tx.run("bind", () => bindKey(id), `${beast.name} knows this device now.`)) {
                setNeedsKey(false);
                refresh();
              }
            }}
          >
            {tx.pending === "bind" ? <Spinner /> : null} Use this device
          </button>
        </div>
      )}

      {/* bottom dock */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="flex w-full max-w-xl items-stretch justify-between gap-1 drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)] sm:gap-3">
          <Action icon="ui-feed" label="Feed" onClick={() => toggle("feed")} active={sheet === "feed"} />
          <Action icon="ui-wardrobe" label="Wardrobe" onClick={() => toggle("wardrobe")} active={sheet === "wardrobe"} />
          <Action icon="ui-talk" label="Talk" onClick={() => toggle("talk")} active={sheet === "talk"} />
          <Action
            icon="ui-cuddle"
            label={tx.pending === "cuddle" ? "Cuddling…" : "Cuddle"}
            onClick={async () => {
              pet();
              if (
                await tx.run(
                  "cuddle",
                  () => cuddle(id),
                  beast.lives < 9 ? `${beast.name} won a life back, and is counted in tonight's check-in.` : `${beast.name} is counted in tonight's check-in.`,
                )
              )
                refresh();
            }}
          />
          <Action icon="ui-persona" label="Personality" onClick={() => toggle("persona")} active={sheet === "persona"} />
          <Link
            href="/alley?tab=prowl"
            aria-label="Missions"
            title="Missions"
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl border-[3px] border-[#1a0b2e] bg-[#ffc93c] px-1 py-1.5 shadow-[0_3px_0_#1a0b2e] transition hover:-translate-y-0.5"
          >
            <Art slot="ui-missions" alt="" className="h-11 w-11 sm:h-14 sm:w-14" />
          </Link>
        </div>
      </nav>

      {/* what the cat is saying: an RPG dialog box above the dock (tap to dismiss) */}
      {speaking && (
        <div className="fixed inset-x-0 bottom-[6.5rem] z-30 flex justify-center px-3 sm:bottom-32">
          <Dialog
            name={beast.name}
            portrait={catSlot(expression)}
            className="w-full max-w-2xl animate-rise"
            onClose={() => setDismissed(line)}
            footer={
              // The needs live here, under what the cat just said: it is the one panel you are
              // already reading, and the dialog has the room the HUD strip does not.
              <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 pt-2">
                <MiniNeed label="Fullness" value={fullness} color="bg-lantern" warn={fullness < 25 ? "hungry" : undefined} />
                <MiniNeed label="Happiness" value={happiness} color="bg-moss" warn={happiness < 30 ? "lonely" : undefined} />
                {proof && (
                  <button
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss underline decoration-dotted underline-offset-4"
                    onClick={() => setSheet("proof")}
                  >
                    <Art slot="ui-verified" size={20} alt="" /> {proof.verified ? "Verified thought" : "Unverified"} · NEAR AI
                  </button>
                )}
              </div>
            }
          >
            <p>
              <Spoken text={line} />
            </p>
          </Dialog>
        </div>
      )}

      {/* toast */}
      {tx.note && !sheet && (
        <div className="fixed inset-x-0 bottom-[5.5rem] z-40 flex justify-center px-3 sm:bottom-28">
          <Notice kind={tx.note.kind} className="glass max-w-lg">
            {tx.note.text}
          </Notice>
        </div>
      )}

      {/* side panel: a tall drawer to the right of the cat (a bottom sheet on phones) */}
      {sheet && (
        <div className="fixed inset-x-0 bottom-[5.25rem] z-50 flex justify-center px-2 md:inset-x-auto md:bottom-auto md:right-5 md:top-24 md:w-[min(400px,32vw)] md:px-0">
          {/* One frame for every sheet: fixed height on desktop so Feed, Wardrobe, Talk and
              Personality do not resize the drawer as you switch between them. On phones it stays a
              content-sized bottom sheet, where a fixed height would waste the screen. */}
          <div className="glass relative flex max-h-[55dvh] w-full animate-rise flex-col gap-3 overflow-y-auto p-4 sm:p-5 md:h-[min(30rem,calc(100dvh-14rem))] md:max-h-none md:bg-[rgb(22_15_56/0.96)]">
            <button onClick={() => setSheet(null)} className="absolute right-2 top-2 transition hover:scale-110" aria-label="Close">
              <Art slot="ui-close" alt="" size={34} />
            </button>
            {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
      {sheet === "feed" && (
        <Panel title="Feed">
          {/* The two bars the food moves, so you can see what feeding is for while you do it. */}
          <div className="flex flex-col gap-2">
            <Need label="Fullness" value={fullness} color="bg-lantern" warn={fullness < 25 ? "hungry" : undefined} />
            <Need label="Happiness" value={happiness} color="bg-moss" warn={happiness < 30 ? "lonely" : undefined} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["fish", "catnip"] as const).map((food) => {
              const have = items.data?.[food] ?? 0;
              return (
                <button
                  key={food}
                  className="btn btn-ghost"
                  disabled={!!tx.pending}
                  onClick={async () => {
                    setProof(null);
                    setDismissed(null);
                    if (have < 1) {
                      life.touch();
                      life.flash("angry", 2200);
                      setBubble(food === "fish" ? "No fish?! *glares at the empty bowl*" : "Where's my catnip? *sulks*");
                      return;
                    }
                    life.touch();
                    life.flash("curious", 3000);
                    setBubble("*stares at the bowl*");
                    if (await tx.run(`feed-${food}`, () => feedBeast(id, food))) {
                      play("eat", 2200);
                      setBubble(food === "fish" ? "*munch munch* FISH. You are my favourite human." : "*rolls in the catnip* Wheeeee!");
                      refresh();
                    }
                  }}
                >
                  {tx.pending === `feed-${food}` ? <Spinner /> : <Art slot={`item-${food}`} size={22} alt="" />} {food === "fish" ? "Fish" : "Catnip"} ×{have}
                </button>
              );
            })}
          </div>
          <PanelNote>
            Fish fills {beast.name} up; catnip cheers it up. No food? Go on a mission and whip some off the windowsills, or buy from Old Tom and Sister Clove on{" "}
            <Link href="/alley?tab=lane" className="underline decoration-dotted underline-offset-2">
              Lantern Lane
            </Link>
            . Every mission makes {beast.name} a little hungrier.
          </PanelNote>
        </Panel>
      )}

      {sheet === "wardrobe" && (
        <Panel title="Wardrobe">
          <div className="grid grid-cols-4 gap-2 md:grid-cols-2">
            {COSMETICS.map((c) => {
              const owned = (items.data?.[c] ?? 0) > 0;
              const on = outfit.includes(c);
              return (
                <button
                  key={c}
                  disabled={!owned || !!tx.pending}
                  className={`flex flex-col items-center gap-1 rounded-lg border-[3px] p-3 text-sm ${on ? "border-[#1a0b2e] bg-[#ffc93c] text-[#1a0b2e] shadow-[0_3px_0_#1a0b2e]" : "border-transparent bg-white/5"} ${owned ? "" : "opacity-40"}`}
                  onClick={async () => {
                    const next = on ? outfit.filter((o) => o !== c) : [...outfit, c];
                    life.touch();
                    if (await tx.run(`dress-${c}`, () => dressBeast(id, next))) {
                      life.flash(on ? "neutral" : "surprised", 900);
                      setTimeout(() => play("pet"), 900);
                      setBubble(on ? "*shakes it off*" : "*admires reflection* Do I look dangerous? I look dangerous.");
                      setProof(null);
                      refresh();
                    }
                  }}
                >
                  <Art slot={`item-${c}`} size={64} alt="" />
                  {tx.pending === `dress-${c}` ? <Spinner /> : c}
                </button>
              );
            })}
          </div>
          <PanelNote>
            Miso knits the Lane&apos;s hats and scarves; buy them with {beast.name}&apos;s YARN on{" "}
            <Link href="/alley?tab=lane" className="underline decoration-dotted underline-offset-2">
              Lantern Lane
            </Link>
            . Dressing up cheers a cat right up.
          </PanelNote>
        </Panel>
      )}

      {sheet === "talk" && (
        <TalkPanel
          beast={beast}
          credits={credits}
          busy={!!tx.pending}
          history={thoughts.data ?? []}
          onBuy={async (n) => {
            if (await tx.run("buy", () => buyThoughts(id, n), `${beast.name} paid ${n} YARN for ${n} thought${n === 1 ? "" : "s"}.`)) refresh();
          }}
          onTyping={() => {
            life.touch();
            life.flash("curious", 1500);
          }}
          onThinking={() => {
            setBubble("Hmm… *thinks very hard*");
            setProof(null);
            life.touch();
            life.flash("curious", 30_000);
          }}
          onReply={(r) => {
            life.flash("neutral", 1);
            if (r.ok) {
              setProof(r);
              say(r.reply);
              if (voice) speak(r.reply);
              refresh();
            } else {
              life.flash("sleepy", 1800);
              setBubble("*yawns* …I lost my train of thought.");
            }
          }}
        />
      )}

      {sheet === "persona" && <PersonaPanel beast={beast} current={care.data?.persona ?? ""} onSaved={refresh} />}

      {sheet === "proof" && proof && <ProofPanel proof={proof} />}
          </div>
        </div>
      )}
    </>
  );
}

function MiniNeed({ label, value, warn, color }: { label: string; value: number; warn?: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] [text-shadow:0_1px_3px_rgb(6_5_26/0.9)]">
      <span className="w-14 shrink-0 text-mist">{label}</span>
      <Bar value={value} tone={value < 25 ? "ember" : color === "bg-moss" ? "green" : "gold"} className="w-20 sm:w-28" />
      <span className={`w-10 shrink-0 ${warn ? "font-semibold text-[#ffb3a1]" : "text-paper/80"}`}>{warn ?? value}</span>
    </div>
  );
}

export function Need({ label, value, warn, color }: { label: string; value: number; warn?: string; color: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-mist">{label}</span>
        {warn ? <Pill tone="ember">{warn}</Pill> : <span className="font-display">{value}</span>}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-night-700">
        <div className={`h-full rounded-full ${value < 25 ? "bg-ember" : color} transition-[width] duration-700`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Action({ icon, label, onClick, active }: { icon: ArtSlot; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl border-[3px] px-1 py-1.5 font-display text-xs tracking-wide transition sm:text-base ${
        active ? "border-[#1a0b2e] bg-[#ffc93c] text-[#1a0b2e] shadow-[0_3px_0_#1a0b2e]" : "border-transparent text-paper hover:-translate-y-0.5 hover:bg-white/5"
      }`}
    >
      <Art slot={icon} alt="" className="h-11 w-11 transition hover:scale-110 sm:h-14 sm:w-14" />
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="pr-10 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** The closing line of a sheet: the "what is this for" note, pinned to the bottom of the frame. */
function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-auto border-t border-white/10 pt-3 text-xs leading-snug text-mist">{children}</p>;
}

// ---------------------------------------------------------------- talking

function TalkPanel({
  beast,
  credits,
  busy,
  history,
  onBuy,
  onThinking,
  onReply,
  onTyping,
}: {
  beast: Beast;
  credits: number;
  busy: boolean;
  history: { said: string; reply: string }[];
  onBuy: (n: number) => void;
  onThinking: () => void;
  onReply: (r: TalkResult) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const said = text.trim();
    if (!said || sending) return;
    setSending(true);
    setError(null);
    onThinking();
    const r = await talkToCat(beast.token_id, said);
    setSending(false);
    if (r.ok) setText("");
    else setError(r.error);
    onReply(r);
  };

  return (
    <Panel title={`Talk to ${beast.name}`}>
      {history.length > 0 && (
        <ol className="flex max-h-56 flex-col gap-2 overflow-y-auto text-sm">
          {history.map((t, i) => (
            <li key={i} className="flex flex-col gap-1">
              <span className="self-end rounded-2xl bg-lantern/15 px-3 py-1.5 text-paper">{t.said}</span>
              <span className="self-start rounded-2xl bg-white/5 px-3 py-1.5 text-paper/90">{t.reply}</span>
            </li>
          ))}
        </ol>
      )}
      {credits < 1 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm">
          <p>
            {beast.name} is out of thoughts. Every reply costs one thought, and {beast.name} pays for it from its own purse: 1 YARN each, which
            goes to the Lane&apos;s treasury.
          </p>
          <div className="flex flex-wrap gap-2">
            {[3, 10].map((n) => (
              <button key={n} className="btn btn-lantern btn-sm" disabled={busy} onClick={() => onBuy(n)}>
                {busy ? <Spinner /> : null} Buy {n} thoughts · {n} YARN
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className="input flex-1"
            placeholder={`Say something to ${beast.name}…`}
            value={text}
            maxLength={240}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            disabled={sending}
          />
          <button className="btn btn-lantern" disabled={sending || !text.trim()}>
            {sending ? <Spinner /> : null} Say
          </button>
        </form>
      )}
      {sending && <p className="text-xs text-mist">{beast.name} is thinking inside a sealed enclave… (attesting, then answering)</p>}
      {error && <Notice kind="err">{error}</Notice>}
      <PanelNote>
        {beast.name} thinks with NEAR AI in a hardware-sealed enclave. Its personality and memories come only from the Lane&apos;s records, every reply is
        signed by the enclave and checked, and the proof is written into {beast.name}&apos;s diary. {credits > 0 && `${credits} thought${credits === 1 ? "" : "s"} left.`}
      </PanelNote>
    </Panel>
  );
}

// ---------------------------------------------------------------- personality

function PersonaPanel({ beast, current, onSaved }: { beast: Beast; current: string; onSaved: () => void }) {
  const [text, setText] = useState(current);
  const tx = useTx();
  return (
    <Panel title="Personality">
      <p className="text-xs text-mist">
        Who is {beast.name}? This is written into the Lane&apos;s records and shapes every thought {beast.name} has. Leave it empty and {beast.name}&apos;s
        nature comes from its stats.
      </p>
      {/* Grows into whatever height the frame gives it, so the panel has no dead space. */}
      <textarea
        className="input min-h-28 flex-1 resize-none"
        maxLength={480}
        placeholder={`e.g. ${beast.name} is a dramatic little thief who pretends not to care but always shares fish with strays.`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button
          className="btn btn-lantern btn-sm"
          disabled={!!tx.pending || text === current}
          onClick={async () => {
            if (await tx.run("persona", () => setPersona(beast.token_id, text.trim()), `${beast.name} feels different somehow.`)) onSaved();
          }}
        >
          {tx.pending ? <Spinner /> : null} Save
        </button>
        <span className="text-xs text-mist">{text.length}/480</span>
      </div>
      {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
    </Panel>
  );
}

// ---------------------------------------------------------------- the proof

function ProofPanel({ proof }: { proof: Verified }) {
  const row = (k: string, v: React.ReactNode) => (
    <tr>
      <td className="py-1 pr-3 align-top text-mist">{k}</td>
      <td className="break-all py-1 font-mono text-xs">{v}</td>
    </tr>
  );
  const tick = (b: boolean) => (b ? <span className="text-moss">✓</span> : <span className="text-ember">✗</span>);
  return (
    <Panel title="How we know the cat really said that">
      <ul className="flex flex-col gap-1 text-sm">
        <li>{tick(proof.checks.attestation)} NEAR AI&apos;s enclaves proved themselves with a fresh nonce (Intel TDX quotes + NVIDIA GPU evidence)</li>
        <li>{tick(proof.checks.signerAttested)} The key that signed the reply is the one inside the attested enclave</li>
        <li>{tick(proof.checks.textMatches)} The signed text is exactly the model plus our hashes of the request and the reply</li>
        <li>{tick(proof.checks.signerRecovered)} The signature recovers to that key</li>
      </ul>
      <table className="w-full text-sm">
        <tbody>
          {row("Model", proof.model)}
          {row("Chat id", proof.chatId)}
          {row("Enclave signer", proof.signingAddress)}
          {row("sha256(request)", proof.requestHash)}
          {row("sha256(reply)", proof.responseHash)}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3 text-xs">
        {proof.txHash && (
          <a className="underline decoration-dotted underline-offset-2" href={`${CONFIG.explorer}/txns/${proof.txHash}`} target="_blank" rel="noreferrer">
            Recorded on NEAR ↗
          </a>
        )}
        <a className="underline decoration-dotted underline-offset-2" href={`/api/cat/thought/${encodeURIComponent(proof.chatId)}`} target="_blank" rel="noreferrer">
          Exact request &amp; reply bytes ↗
        </a>
        <a className="underline decoration-dotted underline-offset-2" href="https://cloud.near.ai/verify" target="_blank" rel="noreferrer">
          NEAR AI Verification Center ↗
        </a>
      </div>
    </Panel>
  );
}
