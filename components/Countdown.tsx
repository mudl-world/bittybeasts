"use client";
import Art from "./Art";
// Countdown to the next market night, from the alley's night() view.
import { useEffect, useState } from "react";
import { getNight, type NightView } from "@/lib/chain";
import { duration } from "@/lib/ui/format";

export default function Countdown({ className = "", onNight }: { className?: string; onNight?: (n: NightView) => void }) {
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

  if (failed) return <span className={`text-xs text-mist/70 ${className}`}>Night clock unavailable</span>;
  if (!night || now === null) return <span className={`text-xs text-mist/70 ${className}`}>Reading the moon…</span>;
  const end = night.started_ms + night.night_ms;
  const left = end - now;
  const pct = Math.max(0, Math.min(1, 1 - left / night.night_ms));
  return (
    <span className={`inline-flex items-center gap-2 text-xs text-mist ${className}`} title={`Night ${night.night}`}>
      <Art slot="st-clock" alt="" size={30} className={pct > 0.9 ? "animate-pulse" : ""} />
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

