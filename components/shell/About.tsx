"use client";
// "What is this?" on the title screen: the pitch in a sheet, so the title screen stays a single screen.
import Link from "next/link";
import { useState } from "react";
import Art from "../Art";
import type { ArtSlot } from "@/lib/ui/art";

const POINTS: { icon: ArtSlot; title: string; body: string }[] = [
  {
    icon: "ui-talk",
    title: "It talks back",
    body: "Your cat thinks with NEAR AI inside sealed enclaves. Every reply is proven to come from the enclave and written into its diary on NEAR.",
  },
  {
    icon: "item-yarn",
    title: "It pays its own way",
    body: "Each cat owns a NEAR account with its own purse of YARN. It pays for its thoughts, food and clothes itself.",
  },
  {
    icon: "ui-missions",
    title: "Nine lives to spend",
    body: "Take it prowling over the rooftops at night. Go daring for rare loot, and a fall costs a life and leaves a scar.",
  },
  {
    icon: "ui-lane",
    title: "A world that runs itself",
    body: "Merchant cats with their own wallets set prices, post requests and go broke. The Ledger writes the news every night.",
  },
];

export default function About() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="What is this?" title="What is this?" className="pointer-events-auto transition hover:scale-110">
        <Art slot="ui-help" alt="" size={52} />
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-night-950/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
          <div className="glass w-full max-w-3xl animate-rise p-5 text-left sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Bitty Beasts</h2>
              <button className="transition hover:scale-110" onClick={() => setOpen(false)} aria-label="Close">
                <Art slot="ui-close" alt="" size={38} />
              </button>
            </div>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {POINTS.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  <Art slot={p.icon} size={52} alt="" className="shrink-0" style={{ alignSelf: "flex-start" }} />
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-lantern">{p.title}</h3>
                    <p className="mt-0.5 text-sm leading-snug text-mist">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col items-stretch gap-2.5 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
              <Link href="/ledger" className="btn btn-ghost btn-sm">
                Tonight&apos;s Ledger
              </Link>
              <Link href="/yarn" className="btn btn-ghost btn-sm">
                How $YARN works
              </Link>
              <Link href="/fast-forward" className="btn btn-ghost btn-sm">
                A week in a minute
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
