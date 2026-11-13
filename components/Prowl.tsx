"use client";
// Prowl: 30 seconds across night rooftops. Safe or Daring. Used in /alley and in stray mode.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONFIG, settleRun, type Beast, type Item, type RunResult, type Stats } from "@/lib/chain";
import { markSlot, type ArtSlot } from "@/lib/ui/art";
import { friendly, isMissingKey } from "@/lib/ui/errors";
import { ITEM_LABEL } from "@/lib/ui/format";
import {
  H,
  RUN_SECONDS,
  W,
  bindWindowPx,
  createGame,
  draw,
  finalHaul,
  loadSprites,
  multiplier,
  rareChance,
  reachPx,
  step,
  type EndReason,
  type Game,
  type Input,
  type MerchantKey,
  type Sprites,
} from "@/lib/ui/prowl-engine";
import Art from "./Art";
import ChainTail from "./ChainTail";
import { Bar, Notice, Pill, Spinner } from "./ui";

type Props = {
  /** null = stray mode: safe runs only, nothing saved. */
  beast: Beast | null;
  onSettled?: () => void;
  onNeedsKey?: () => void;
};

type Hud = { left: number; haul: Record<Item, number>; rooftops: number; mult: number; binds: number; mischief: number };
type Outcome = {
  reason: EndReason;
  daring: boolean;
  result: RunResult;
  rawHaul: Record<Item, number>;
  livesBefore: number;
};

const STRAY_STATS: Stats = { reach: 5, grip: 5, speed: 5, luck: 3 };
const MARKS = ["scar", "bent-ear", "patch"] as const;

export default function Prowl({ beast, onSettled, onNeedsKey }: Props) {
  const stray = beast === null;
  const stats = beast?.stats ?? STRAY_STATS;
  const lives = beast?.lives ?? 9;
  const resting = !stray && lives <= 0;
  const blocked = !!beast?.wander;

  const [phase, setPhase] = useState<"choose" | "running" | "done">("choose");

  // The run is full screen: stop the page underneath from scrolling while it's up.
  useEffect(() => {
    if (phase === "choose") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);
  const [daring, setDaring] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [settle, setSettle] = useState<{ state: "idle" | "pending" | "ok" | "err"; text?: string; lives?: number }>({ state: "idle" });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<Input>({ jump: false, whip: false, bind: false });
  const bindSources = useRef({ key: false, pointer: false, button: false });
  const spritesRef = useRef<Sprites>({});
  const quitRef = useRef(false);
  const cashRef = useRef(false);

  useEffect(() => {
    spritesRef.current = loadSprites();
  }, []);

  const syncBind = () => {
    const b = bindSources.current;
    inputRef.current.bind = b.key || b.pointer || b.button;
  };

  const start = useCallback(
    (isDaring: boolean) => {
      setDaring(isDaring);
      setOutcome(null);
      setSettle({ state: "idle" });
      quitRef.current = false;
      cashRef.current = false;
      gameRef.current = createGame(isDaring, stats);
      setPhase("running");
    },
    [stats],
  );

  const finish = useCallback(
    async (g: Game, reason: EndReason) => {
      const fell = reason === "fell";
      const mark = fell && g.daring ? MARKS[Math.floor(Math.random() * MARKS.length)] : undefined;
      const whips: Record<string, number> = {};
      for (const [k, n] of Object.entries(g.whips) as [MerchantKey, number][]) if (n > 0) whips[CONFIG.merchants[k]] = n;
      const result: RunResult = {
        daring: g.daring,
        rooftops: g.rooftops,
        haul: finalHaul(g),
        fell,
        ...(mark ? { mark } : {}),
        whips_on_awning: whips,
        binds: g.binds,
      };
      const o: Outcome = { reason, daring: g.daring, result, rawHaul: { ...g.haul }, livesBefore: lives };
      setOutcome(o);
      setPhase("done");
      if (stray || reason === "quit") return;
      setSettle({ state: "pending" });
      const res = await settleRun(beast.token_id, result);
      if (res.ok) {
        setSettle({ state: "ok", lives: res.lives });
        onSettled?.();
      } else {
        if (isMissingKey(res.error)) onNeedsKey?.();
        setSettle({ state: "err", text: friendly(res.error, "The night watch didn't record that run. Your Beast is fine; try another prowl.") });
      }
    },
    [beast, lives, onNeedsKey, onSettled, stray],
  );

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  // Game loop.
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!canvas || !g) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let ended = false;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(g, dt, inputRef.current);
      inputRef.current.jump = false;
      inputRef.current.whip = false;
      if (quitRef.current) g.over = "quit";
      if (cashRef.current && !g.falling) g.over = "cashout";
      draw(ctx, g, spritesRef.current, { reduced });
      if (now - hudAt > 120 || g.over) {
        hudAt = now;
        setHud({
          left: Math.max(0, RUN_SECONDS - g.t),
          haul: { ...g.haul },
          rooftops: g.rooftops,
          mult: multiplier(g),
          binds: g.binds,
          mischief: Object.values(g.whips).reduce((a, b) => a + b, 0),
        });
      }
      if (g.over) {
        if (!ended) {
          ended = true;
          void finishRef.current(g, g.over);
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") {
        if (down && !e.repeat) inputRef.current.jump = true;
        e.preventDefault();
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        if (down && !e.repeat) inputRef.current.whip = true;
        e.preventDefault();
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        bindSources.current.key = down;
        syncBind();
        e.preventDefault();
      } else if (down && (k === "Enter" || k === "c" || k === "C") && g.daring) {
        cashRef.current = true;
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      bindSources.current = { key: false, pointer: false, button: false };
      inputRef.current = { jump: false, whip: false, bind: false };
    };
  }, [phase]);

  // Touch gestures on the canvas: tap = dash, swipe right = whip, hold = bind.
  const gesture = useRef<{ x: number; y: number; id: number; swiped: boolean; hold: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current.jump = true;
    const hold = window.setTimeout(() => {
      bindSources.current.pointer = true;
      syncBind();
    }, 220);
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, swiped: false, hold };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const gs = gesture.current;
    if (!gs || gs.id !== e.pointerId || gs.swiped) return;
    const dx = e.clientX - gs.x;
    const dy = e.clientY - gs.y;
    if (dx > 30 && Math.abs(dy) < Math.abs(dx)) {
      gs.swiped = true;
      inputRef.current.whip = true;
      window.clearTimeout(gs.hold);
    } else if (dy > 30 && Math.abs(dx) < dy) {
      window.clearTimeout(gs.hold);
      bindSources.current.pointer = true;
      syncBind();
    }
  };
  const onPointerUp = () => {
    if (gesture.current) window.clearTimeout(gesture.current.hold);
    gesture.current = null;
    bindSources.current.pointer = false;
    syncBind();
  };

  // ---------- views ----------

  if (phase === "choose") {
    const name = beast?.name ?? "Your stray";
    return (
      // One screen, no scrolling: pick a prowl on the left, your cat's skills and the controls on the right.
      <div className="flex flex-col gap-3">
        {stray && (
          <Notice kind="info">
            Stray mode: safe runs only and nothing is kept. <Link href="/" className="underline">Sign in</Link> to keep your haul.
          </Notice>
        )}
        {blocked && <Notice kind="info">{name} is wandering (up for adoption), so it can&apos;t prowl right now.</Notice>}
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <section className="flex flex-col items-center gap-2">
            <h2 className="title-3d text-xl">Choose tonight&apos;s prowl</h2>
            <div className="flex items-start justify-center gap-4 sm:gap-6">
              <Poster
                art="mission-safe"
                title="Safe prowl"
                tip="Low roofs, small gaps. Miss a jump and the run just ends."
                lines={["Low roofs, easy gaps", "Keep your haul", "No lives at risk"]}
                onPlay={() => start(false)}
                disabled={blocked}
                cta="Go safe"
                tone="btn-lantern"
              />
              <Poster
                art="mission-daring"
                title="Daring prowl"
                tip="High roofs, narrow gaps. Every rooftop multiplies the haul. Cash out any time."
                lines={["High roofs, rare loot", "Haul grows each roof", "Fall = lose a life"]}
                onPlay={() => start(true)}
                disabled={stray || resting || blocked}
                cta="Go daring"
                tone="btn-danger"
                note={stray ? "Strays play it safe." : resting ? `${name} is resting: cuddle it to light a link.` : undefined}
              />
            </div>
          </section>
          <aside className="card flex flex-col gap-4 p-1">
            <div>
              <h2 className="title-3d text-lg">{name}&apos;s skills</h2>
              <p className="text-xs text-mist">Fixed for each cat. They change how its prowls play.</p>
            </div>
            <StatsRow stats={stats} />
            <div>
              <h2 className="title-3d text-lg">How to play</h2>
            </div>
            <Controls />
          </aside>
        </div>
      </div>
    );
  }


  const haul = hud?.haul;
  const hold = (on: boolean) => {
    bindSources.current.button = on;
    syncBind();
  };
  // The run takes over the whole screen: the game scaled to fit, the skyline filling any spare space,
  // and the HUD and controls floating over it. Rendered on <body> so no page layer can sit above it.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-night-950">
      <Art slot="alley-bg" alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-sm" />
      <div className="relative" style={{ width: `min(100vw, calc(100dvh * ${W} / ${H}))`, aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block h-full w-full touch-none select-none bg-night-900 shadow-[0_0_80px_rgba(0,0,0,0.6)]"
          onPointerDown={phase === "running" ? onPointerDown : undefined}
          onPointerMove={phase === "running" ? onPointerMove : undefined}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Prowl game. Space or tap to dash, right arrow or swipe to whip, hold down arrow or hold to bind."
        />
      </div>

      {/* top HUD: time, rooftops, multiplier, binds; haul chips; leave/cash-out */}
      {phase === "running" && hud && (
        <div className="pointer-events-none fixed inset-x-0 top-0 flex flex-col gap-2 p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="glass pointer-events-auto flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:max-w-2xl">
              <div className="flex min-w-36 flex-1 items-center gap-2">
                <span className="font-display text-lg tabular-nums text-paper">{Math.ceil(hud.left)}s</span>
                <Bar value={(hud.left / RUN_SECONDS) * 100} className="flex-1" />
              </div>
              <span className="font-display text-mist">
                Rooftops <b className="text-paper">{hud.rooftops}</b>
              </span>
              {daring && (
                <span className="font-display text-mist">
                  Haul <b className="text-[#ffc93c]">×{hud.mult.toFixed(2)}</b>
                </span>
              )}
              {hud.binds > 0 && <Pill tone="moss">{hud.binds} bound</Pill>}
              {hud.mischief > 0 && <Pill tone="lantern">{hud.mischief} mischief</Pill>}
            </div>
            {daring ? (
              <button className="btn btn-danger pointer-events-auto shrink-0" onClick={() => (cashRef.current = true)} title="Jump down and keep the haul">
                <Art slot="ctl-cashout" alt="" size={30} /> Cash out ×{hud.mult.toFixed(2)}
              </button>
            ) : (
              <button className="btn btn-ghost pointer-events-auto h-12 w-12 shrink-0 p-1" onClick={() => (quitRef.current = true)} aria-label="Stop prowling" title="Stop prowling">
                <Art slot="ui-close" alt="" size={34} />
              </button>
            )}
          </div>
          {haul && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(haul) as [Item, number][])
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <span key={k} className="glass flex items-center gap-1 px-2 py-0.5 font-display text-sm">
                    <Art slot={`item-${k}`} size={22} alt="" /> {n}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {/* touch controls */}
      {phase === "running" && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="glass grid w-full max-w-xl grid-cols-3 gap-2 p-2">
            <button
              className="btn btn-ghost touch-none py-4"
              onPointerDown={(e) => {
                e.preventDefault();
                hold(true);
              }}
              onPointerUp={() => hold(false)}
              onPointerLeave={() => hold(false)}
              title="Hold to bind a rat thief (↓)"
            >
              <Art slot="ctl-bind" alt="" size={34} /> Bind
            </button>
            <button
              className="btn btn-lantern touch-none py-4"
              onPointerDown={(e) => {
                e.preventDefault();
                inputRef.current.jump = true;
              }}
              title="Dash to the next rooftop (Space)"
            >
              <Art slot="ctl-dash" alt="" size={34} /> Dash
            </button>
            <button
              className="btn btn-ghost touch-none py-4"
              onPointerDown={(e) => {
                e.preventDefault();
                inputRef.current.whip = true;
              }}
              title="Whip trinkets off ledges (→)"
            >
              <Art slot="ctl-whip" alt="" size={34} /> Whip
            </button>
          </div>
        </div>
      )}

      {/* the result, over the scene */}
      {phase === "done" && outcome && (
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-night-950/70 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-lg animate-rise p-5">
            <Result outcome={outcome} beast={beast} settle={settle} stray={stray} onAgain={() => setPhase("choose")} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** A mission poster from the artist's art: the picture, its button on the parchment plate, three short lines. */
function Poster(props: { art: ArtSlot; title: string; tip: string; lines: string[]; onPlay: () => void; disabled: boolean; cta: string; tone: string; note?: string }) {
  return (
    // Width follows the screen height so both posters and their lines fit between the HUD and the dock.
    <div className="flex flex-col items-center gap-1.5" style={{ width: "min(40vw, 250px, calc((100dvh - 22rem) * 0.72))" }} title={props.tip}>
      <div className="relative w-full drop-shadow-[0_14px_24px_rgba(0,0,0,0.55)]">
        <Art slot={props.art} alt={props.title} className="w-full" />
        <div className="absolute inset-x-[12%] top-[78%] flex h-[13%] items-center justify-center">
          <button className={`btn btn-sm ${props.tone}`} onClick={props.onPlay} disabled={props.disabled}>
            {props.cta}
          </button>
        </div>
      </div>
      <ul className="flex flex-col items-center font-display text-sm leading-snug text-paper/90 drop-shadow">
        {(props.note ? [props.note] : props.lines).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

const SKILLS: { art: ArtSlot; name: string; key: keyof Stats; hint: (s: Stats) => string }[] = [
  { art: "skill-speed", name: "Speed", key: "speed", hint: () => "longer jumps" },
  { art: "skill-reach", name: "Reach", key: "reach", hint: (s) => `whip reaches ${reachPx(s)}px` },
  { art: "skill-grip", name: "Grip", key: "grip", hint: (s) => `bind window ${bindWindowPx(s)}px` },
  { art: "skill-luck", name: "Luck", key: "luck", hint: (s) => `${Math.round(rareChance(s) * 100)}% rare finds` },
];

function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-col gap-2.5">
      {SKILLS.map((k) => (
        <div key={k.name} className="flex items-center gap-2" title={`${k.name} ${stats[k.key]}/10: ${k.hint(stats)}`}>
          <Art slot={k.art} alt="" size={38} className="shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-baseline justify-between font-display text-sm">
              <span>{k.name}</span>
              <span className="text-[#ffc93c]">{stats[k.key]}/10</span>
            </div>
            <Bar value={stats[k.key] * 10} />
            <span className="text-[0.72rem] text-mist">{k.hint(stats)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const CONTROLS: { art: ArtSlot; name: string; how: string }[] = [
  { art: "ctl-dash", name: "Dash", how: "tap / Space" },
  { art: "ctl-whip", name: "Whip", how: "swipe right / →" },
  { art: "ctl-bind", name: "Bind", how: "hold / ↓" },
  { art: "ctl-cashout", name: "Cash out", how: "daring runs" },
];

function Controls() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CONTROLS.map((c) => (
        <div key={c.name} className="flex items-center gap-1.5 font-display text-sm" title={`${c.name}: ${c.how}`}>
          <Art slot={c.art} alt="" size={34} className="shrink-0" />
          <span className="leading-tight">
            {c.name}
            <span className="block text-[0.72rem] text-mist">{c.how}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Result({
  outcome,
  beast,
  settle,
  stray,
  onAgain,
}: {
  outcome: Outcome;
  beast: Beast | null;
  settle: { state: "idle" | "pending" | "ok" | "err"; text?: string; lives?: number };
  stray: boolean;
  onAgain: () => void;
}) {
  const { result, reason, daring, livesBefore } = outcome;
  const lostLife = reason === "fell" && daring && !stray;
  const livesAfter = settle.lives ?? (lostLife ? Math.max(0, livesBefore - 1) : livesBefore);
  const title =
    reason === "fell" ? (daring ? "Ouch. A long way down." : "Missed a jump. Run over.") : reason === "cashout" ? "Jumped down with the loot!" : reason === "quit" ? "Prowl stopped." : "Dawn's coming. Home with the haul.";
  const keptHaul = !(reason === "fell" && daring);
  const awnings = Object.values(result.whips_on_awning).reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center animate-rise">
      <Art slot={reason === "fell" ? "result-fall" : reason === "cashout" ? "result-cashout" : "result-haul"} alt="" size={200} />
      <h3 className="title-3d text-2xl">{title}</h3>
      <p className="text-sm text-mist">
        {result.rooftops} rooftops{daring ? ` · ×${multiplier({ daring, rooftops: result.rooftops }).toFixed(2)}` : ""} · {result.binds} rats bound
        {awnings ? ` · ${awnings} bits of mischief` : ""}
      </p>
      {result.haul.length ? (
        <div className={`flex flex-wrap justify-center gap-2 ${keptHaul ? "" : "opacity-40 line-through"}`}>
          {result.haul.map(([k, n]) => (
            <span key={k} className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-sm">
              <Art slot={`item-${k}`} size={20} alt="" /> {n} {ITEM_LABEL[k] ?? k}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-mist">Paws empty this time.</p>
      )}
      {lostLife && (
        <div className="flex flex-col items-center gap-2">
          <ChainTail lives={livesAfter} legend={beast?.legend} flash={livesAfter} size="sm" />
          <p className="text-sm text-[#ffb3a1]">
            A link went dark{result.mark ? ` and left a mark: ${result.mark.replace("-", " ")}` : ""}. The haul tumbled into the alley
            {" "}(unless a charm caught it).
          </p>
          {result.mark && <Art slot={markSlot(result.mark)} size={56} className="animate-pop" />}
        </div>
      )}
      {stray ? (
        <p className="text-xs text-mist">Strays keep nothing. Scan a Beast to keep your haul.</p>
      ) : reason === "quit" ? (
        <p className="text-xs text-mist">Stopped runs aren&apos;t recorded.</p>
      ) : settle.state === "pending" ? (
        <p className="flex items-center gap-2 text-sm text-mist">
          <Spinner /> Writing it in the diary…
        </p>
      ) : settle.state === "ok" ? (
        <Notice kind="ok">Saved to {beast?.name ?? "your Beast"}&apos;s diary, and counted in tonight&apos;s check-in.</Notice>
      ) : settle.state === "err" ? (
        <Notice kind="err">{settle.text}</Notice>
      ) : null}
      <button className="btn btn-lantern" onClick={onAgain} disabled={settle.state === "pending"}>
        Prowl again
      </button>
    </div>
  );
}
