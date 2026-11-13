import { Suspense } from "react";
import SceneBackdrop from "@/components/shell/SceneBackdrop";
import WorldMenu from "@/components/shell/WorldMenu";

// Everywhere else in the world: the Lane at night as a fixed backdrop, the map button, and the page on top.
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <Suspense fallback={null}>
        <SceneBackdrop />
      </Suspense>
      <header className="sticky top-0 z-40 flex items-center justify-between px-3 py-3 sm:px-6">
        <Suspense fallback={<div className="h-12 w-28 rounded-full bg-night-950/70" />}>
          <WorldMenu />
        </Suspense>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-[1680px] px-4 lg:px-8 pb-16 sm:px-6">{children}</main>
    </div>
  );
}
