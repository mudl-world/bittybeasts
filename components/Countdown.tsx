"use client";
import Art from "./Art";
// Countdown to the next market night, from the alley's night() view.
import { useEffect, useState } from "react";
import { getNight, type NightView } from "@/lib/chain";
import { duration } from "@/lib/ui/format";

export default function Countdown({
  className = "",
  onNight,
  framed = false,
}: {
  className?: string;
  onNight?: (n: NightView) => void;
  /** Draw it as its own tile, for a HUD row where everything else sits in one. Inline otherwise. */
  framed?: boolean;
}) {
  const [night, setNight] = useState<NightView | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      getNight().then(
        (n) => {
          if (!live) return;
          setNight(n);
          setFailed(false);
          onNight?.(n);
        },
        () => live && setFailed(true),
      );
    load();
    const poll = window.setInterval(load, 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      live = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.clearTimeout(first);
    };
    // onNight is a notification only; reloading on identity change would spam the RPC.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In a HUD the clock is a tile like its neighbours; inline it stays plain text in the sentence.
  const shell = framed
    ? `btn btn-ghost pointer-events-none h-14 shrink-0 gap-2 px-3 ${className}`
    : `inline-flex items-center gap-2 text-xs text-mist ${className}`;

  if (failed) return <span className={shell}>Night clock unavailable</span>;
  if (!night || now === null) return <span className={shell}>Reading the moon…</span>;
  const end = night.started_ms + night.night_ms;
  const left = end - now;
  const pct = Math.max(0, Math.min(1, 1 - left / night.night_ms));
  const ending = pct > 0.9;

  if (framed)
    return (
      <span className={shell} title={`Night ${night.night}`}>
        <Art slot="st-clock" alt="" size={26} className={`shrink-0 ${ending ? "animate-pulse" : ""}`} />
        <span className="font-display text-sm text-mist">Night {night.night}</span>
        {left > 0 ? (
          <b className={`font-display text-lg tabular-nums ${ending ? "text-ember" : "text-paper"}`}>{duration(left)}</b>
        ) : (
          <b className="font-display text-sm text-lantern">needs closing</b>
        )}
      </span>
    );

  return (
    <span className={shell} title={`Night ${night.night}`}>
      <Art slot="st-clock" alt="" size={30} className={ending ? "animate-pulse" : ""} />
      {left > 0 ? (
        <span>
          Night {night.night} · next night in <b className="font-display text-paper tabular-nums">{duration(left)}</b>
        </span>
      ) : (
        <span>Night {night.night} is over · waiting for someone to close it</span>
      )}
    </span>
  );
}

