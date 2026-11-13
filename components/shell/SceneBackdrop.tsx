"use client";
// The full-screen scene behind a game page, picked from the URL.
import { usePathname } from "next/navigation";
import type { ArtSlot } from "@/lib/ui/art";
import Art from "../Art";

const SCENES: [string, ArtSlot][] = [
  ["/ledger", "ledger-scene"],
  ["/activity", "ledger-scene"],
  ["/yarn", "yarn-scene"],
  ["/back-alley", "backalley-scene"],
  ["/beast/", "story-scene"],
];

export default function SceneBackdrop() {
  const path = usePathname();
  const slot = SCENES.find(([p]) => path.startsWith(p))?.[1] ?? "hero-bg";
  return (
    <div className="fixed inset-0 -z-0" aria-hidden>
      {/* same treatment as the missions screens: softened, dimmed, toned down, with a vignette */}
      <Art slot={slot} alt="" className="h-full w-full scale-105 object-cover blur-[3px] brightness-[0.55] saturate-[0.8]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,transparent_25%,rgb(6_5_26/0.75)_80%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-night-950/50 via-transparent to-night-950/60" />
    </div>
  );
}
