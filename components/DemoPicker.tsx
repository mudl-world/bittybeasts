"use client";
// One-click demo players (testnet). Each comes with a woken Beast and its keychain secret, so
// visitors and judges can prowl, trade, boop and try a resale without an email or a real keychain.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listDemoAccounts, signInAsDemo, type DemoAccount } from "@/lib/chain";
import { notifySession } from "@/lib/ui/session";

export default function DemoPicker({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [demos, setDemos] = useState<DemoAccount[] | null>(null);

  useEffect(() => {
    listDemoAccounts()
      .then(setDemos)
      .catch(() => setDemos([]));
  }, []);

  if (!demos || demos.length === 0) return null;

  function pick(d: DemoAccount) {
    signInAsDemo(d);
    notifySession();
    router.push("/room");
  }

  return (
    <div className={`card flex h-full flex-col gap-3 ${compact ? "p-4" : "p-5"}`}>
      <div>
        <p className="font-display text-lg font-semibold">Just looking? Borrow a demo cat</p>
        <p className="text-sm text-mist">Shared demo players. Anyone can pick one, so expect other paws on it.</p>
      </div>
      {/* A grid, not a wrapping row: equal-width buttons line up instead of leaving a ragged last line. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {demos.map((d, i) =>
          d.beast ? (
            <button key={d.accountId} className="btn btn-ghost w-full" onClick={() => pick(d)}>
              Play as {d.beast.name}
            </button>
          ) : (
            <button
              key={d.accountId}
              className="btn btn-ghost w-full"
              title="A player with no Beast yet: use it to adopt a wandering Beast"
              onClick={() => pick(d)}
            >
              Demo buyer {i + 1}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
