"use client";
// The cold open: the story film (remotion/StoryFilm.tsx, drawn in code), then Sister Clove takes over.
// Skippable at any point. The same film renders to MP4 with the Remotion CLI.
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { HEIGHT, WIDTH } from "@/remotion/script";
import { CLOVE } from "@/lib/story/world";
import Dialog from "../Dialog";
import Cover from "../shell/Cover";
import Art from "../Art";

const FilmPlayer = dynamic(() => import("./FilmPlayer"), {
  ssr: false,
  loading: () => <div className="w-full animate-pulse bg-night-800" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} />,
});

const SEEN_KEY = "bb:intro-seen";

export function introSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked: never trap anyone in the intro
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

export default function ColdOpen({ onDone, doneLabel = "Into the alley" }: { onDone: () => void; doneLabel?: string }) {
  const [step, setStep] = useState<"film" | "clove">("film");
  const toClove = useCallback(() => setStep("clove"), []);
  const finish = () => {
    markIntroSeen();
    onDone();
  };

  return (
    // Full screen: the film covers the window (like the room), with Skip and Next floating over it.
    <div className="fixed inset-0 z-[80] bg-night-950">
      {step === "film" ? (
        <Cover ratio={WIDTH / HEIGHT}>
          <FilmPlayer onEnded={toClove} />
        </Cover>
      ) : (
        <>
          <Cover ratio={1622 / 913}>
            <Art slot="room-bg" alt="" className="h-full w-full object-cover" />
          </Cover>
          <div className="absolute inset-0 bg-night-950/40" />
          <div className="absolute inset-x-0 bottom-28 flex justify-center px-4">
            <Dialog name={CLOVE.name} portrait="merchant-clove" className="w-full max-w-2xl animate-rise">
              <p>{CLOVE.intro}</p>
              <p className="text-paper/80">
                Every night the merchants post what they need, enough of us have to show up to keep the lanterns lit, and the Ledger writes down whatever happened. I&apos;ll point you
                at whatever matters most right now.
              </p>
            </Dialog>
          </div>
        </>
      )}

      <button onClick={finish} className="btn btn-ghost btn-sq absolute right-4 top-4 z-10 h-14 w-14 p-1" aria-label="Skip the story" title="Skip">
        <Art slot="ui-close" alt="" size={40} />
      </button>
      <div className="absolute bottom-6 right-4 z-10 flex gap-2 sm:right-6">
        {step === "film" ? (
          <button className="btn btn-lantern" onClick={() => setStep("clove")}>
            Next
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setStep("film")}>
              Watch again
            </button>
            <button className="btn btn-lantern" onClick={finish}>
              {doneLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
