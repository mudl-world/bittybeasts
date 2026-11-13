import type { Metadata } from "next";
import FastForward from "@/components/FastForward";

export const metadata: Metadata = { title: "Fast-forward" };

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-4xl font-bold">A week on Lantern Lane, in a minute</h1>
        <p className="mt-1 inline-block rounded-full bg-lantern/15 px-3 py-1 text-xs font-semibold text-lantern">
          Simulation — same pricing.ts and events.ts as the live alley
        </p>
        <p className="mt-2 max-w-2xl text-sm text-mist">
          Two dozen pretend Beasts prowl and trade for seven nights. Watch merchants change their prices, lanterns go out and get revived,
          and $YARN get spun on good nights and burned on missed ones. Same seed, same week, every time.
        </p>
      </header>
      <FastForward />
    </div>
  );
}
