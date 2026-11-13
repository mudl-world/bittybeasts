"use client";
// The world menu: one round button that opens a full-screen map of the game. Replaces a website nav bar.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ART, artSrc, type ArtSlot } from "@/lib/ui/art";
import { signOut, useSession } from "@/lib/ui/session";
import Art from "../Art";

const PLACES: { href: string; label: string; blurb: string; icon: ArtSlot; match: (p: string, tab: string | null) => boolean }[] = [
  { href: "/room", label: "Your room", blurb: "Feed, dress and talk to your cat", icon: "cat-happy", match: (p) => p.startsWith("/room") },
  { href: "/alley?tab=prowl", label: "Missions", blurb: "Prowl the rooftops at night", icon: "ui-missions", match: (p, t) => p.startsWith("/alley") && t !== "lane" },
  { href: "/alley?tab=lane", label: "Lantern Lane", blurb: "Trade with the merchant cats", icon: "ui-lane", match: (p, t) => p.startsWith("/alley") && t === "lane" },
  { href: "/ledger", label: "The Ledger", blurb: "Tonight's news and the Ages", icon: "ui-ledger", match: (p) => p.startsWith("/ledger") },
  { href: "/yarn", label: "The Great Yarn", blurb: "$YARN and the alley's nine lives", icon: "item-yarn", match: (p) => p.startsWith("/yarn") },
  { href: "/activity", label: "On chain", blurb: "Every transaction, live from NEAR", icon: "st-receipt", match: (p) => p.startsWith("/activity") },
  { href: "/fast-forward", label: "Fast-forward", blurb: "A week on the Lane in a minute", icon: "item-lantern", match: (p) => p.startsWith("/fast-forward") },
  { href: "/back-alley", label: "Back Alley", blurb: "For cat owners only", icon: "item-moonstone", match: (p) => p.startsWith("/back-alley") },
  { href: "/story", label: "The story", blurb: "Watch the cold open again", icon: "ui-talk", match: (p) => p.startsWith("/story") },
];

export default function WorldMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const [tab, setTab] = useState<string | null>(null);
  const { session } = useSession();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the tab once the menu opens (client only)
    setTab(new URLSearchParams(window.location.search).get("tab"));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Open the map" title="Map" className={`btn btn-lantern btn-sq h-14 w-14 shrink-0 p-1 ${className}`}>
        <Art slot="ui-map" alt="" size={40} />
      </button>

      {open &&
        // Rendered on <body>, above everything (HUD, dock, sheets): a parent's stacking context can't trap it.
        createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-night-950/95 p-4 backdrop-blur-lg animate-rise sm:justify-center sm:p-8" role="dialog" aria-modal="true" aria-label="Map">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artSrc("logo")} alt="Bitty Beasts" width={ART.logo.w} height={ART.logo.h} className="h-14 w-auto sm:h-20" />
            <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sq h-16 w-16 p-1" aria-label="Close the map" title="Close">
              <Art slot="ui-close" alt="" size={50} />
            </button>
          </div>
          <nav className="mx-auto mt-6 grid w-full max-w-4xl grid-cols-3 gap-3 sm:grid-cols-5">
            {PLACES.map((p) => {
              const here = p.match(path, tab);
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  onClick={() => setOpen(false)}
                  aria-label={`${p.label}: ${p.blurb}`}
                  title={`${p.label} · ${p.blurb}`}
                  className={`group flex aspect-square flex-col items-center justify-center rounded-2xl border-[3px] border-[#1a0b2e] p-4 text-center shadow-[0_5px_0_#1a0b2e] transition hover:-translate-y-0.5 ${
                    here ? "bg-[#ffc93c] text-[#1a0b2e]" : "bg-[#2f2370] hover:bg-[#3b2d8a]"
                  }`}
                >
                  <Art slot={p.icon} alt="" size={p.icon.startsWith("cat-") ? 84 : 116} className="transition group-hover:scale-110" />
                </Link>
              );
            })}
          </nav>
          <div className="mx-auto mt-6 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
            <Link href="/" onClick={() => setOpen(false)} className="btn btn-ghost btn-sq h-20 w-20 p-1" aria-label="Title screen" title="Title screen">
              <Art slot="ui-home" alt="" size={62} />
            </Link>
            {session && (
              <button
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className="btn btn-ghost btn-sq h-20 w-20 p-1"
                aria-label="Sign out"
                title={`Sign out (${session.email ?? session.accountId})`}
              >
                <Art slot="ui-signout" alt="" size={62} />
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
