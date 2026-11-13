"use client";
// The story film in the Remotion Player. Loaded only in the browser (see ColdOpen): the Player reads
// the clock while rendering, which can't be prerendered.
import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import StoryFilm from "@/remotion/StoryFilm";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "@/remotion/script";

export default function FilmPlayer({ onEnded }: { onEnded: () => void }) {
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.addEventListener("ended", onEnded);
    return () => p.removeEventListener("ended", onEnded);
  }, [onEnded]);
  return (
    <Player
      ref={player}
      component={StoryFilm}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      style={{ width: "100%", height: "100%" }}
      autoPlay
      clickToPlay={false}
    />
  );
}
