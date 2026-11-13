"use client";
// Sister Clove reads the live Lane and tells the player what matters right now.
// No quest list: her advice comes from the alley's lives, tonight's tugs, the merchants'
// requests and the Beast's own state, so it changes every night on its own.
import Link from "next/link";
import { useEffect, useState } from "react";
import { getTuggedTonight, type Beast, type Item } from "@/lib/chain";
import type { MerchantRequest } from "@/lib/economy/requests";
import { MERCHANTS } from "@/lib/economy/pricing";
import type { Edition } from "@/lib/story/ledger";
import { useLane } from "@/lib/story/useLane";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "../Art";
import Dialog from "../Dialog";

type Advice = { text: string; href?: string; cta?: string };

const LAST_SEEN = (id: string) => `bb:last-night:${id}`;

export function cloveAdvice(input: {
  beast: Beast;
  items: Record<Item, number> | undefined;
  tugged: boolean | undefined;
  tugsNeeded: number;
  alleyLives: number;
  requests: MerchantRequest[];
}): Advice[] {
  const { beast, items, requests } = input;
  const out: Advice[] = [];
  const name = beast.name;

  if (beast.wander) return [{ text: `${name} is out wandering, little one. Nothing to do but wait for the right paws to come along.` }];
  if (beast.lives <= 0)
    out.push({ text: `${name} has no links lit. Rest, and stick to safe runs. Cuddle it in its room each day and a link comes back.`, href: "/alley?tab=prowl", cta: "Safe prowl" });

  if (!input.tugged && input.tugsNeeded > 0) {
    out.push({
      text:
        input.alleyLives <= 3
          ? `The alley's down to ${input.alleyLives} li${input.alleyLives === 1 ? "fe" : "ves"}, and ${input.tugsNeeded} more cat${input.tugsNeeded === 1 ? " still needs" : "s still need"} to play tonight. One prowl from ${name} counts. Please.`
          : `${input.tugsNeeded} more cat${input.tugsNeeded === 1 ? " needs" : "s need"} to play tonight. Any prowl from ${name} counts, and every cat that played gets fresh YARN at dawn.`,
      href: "/alley?tab=prowl",
      cta: "Prowl",
    });
  }

  const wants = requests.filter((r) => r.kind === "want" && r.item && r.remaining > 0 && r.merchant !== "clove");
  const canFill = wants.find((r) => (items?.[r.item!] ?? 0) > 0);
  if (canFill) {
    out.push({
      text: `${MERCHANTS[canFill.merchant].name} is asking for ${canFill.remaining} ${canFill.item}, and you're carrying ${items?.[canFill.item!]}. They'll pay a quarter more tonight.`,
      href: "/alley?tab=lane",
      cta: "Sell",
    });
  } else if (wants[0]) {
    const w = wants[0];
    out.push({
      text: `${MERCHANTS[w.merchant].name} wants ${w.remaining} ${w.item} before dawn and is paying extra. ${w.item === "fish" || w.item === "button" ? "Safe runs find those." : "Those turn up on daring runs."}`,
      href: "/alley?tab=prowl",
      cta: "Go find some",
    });
  }

  const refuse = requests.find((r) => r.kind === "refuse");
  if (refuse && (items?.[refuse.item!] ?? 0) > 0)
    out.push({ text: `Don't bother ${MERCHANTS[refuse.merchant].name} with ${refuse.item} tonight. They're full up. Hold on to it, or try a stall.` });

  const dark = requests.find((r) => r.kind === "closed");
  if (dark)
    out.push({
      text: `${MERCHANTS[dark.merchant].name}'s stall is dark. If nobody invests, it stays that way. Whoever relights it gets a share of the takings.`,
      href: "/alley?tab=lane",
      cta: "Invest",
    });

  const bind = requests.find((r) => r.kind === "help" && r.remaining > 0);
  if (bind) out.push({ text: `And the Gnawers: ${bind.got} of ${bind.wanted} bound tonight. Hold to bind when one runs past.` });

  if (!out.length) out.push({ text: `A calm night. ${name} could push a daring run for bells and moonstones, if you're feeling brave.`, href: "/alley?tab=prowl", cta: "Prowl" });
  return out.slice(0, 3);
}

function readLastSeen(tokenId: string): number | null {
  try {
    const v = localStorage.getItem(LAST_SEEN(tokenId));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export default function CloveGuide({ beast, items, refreshKey = 0 }: { beast: Beast; items: Record<Item, number> | undefined; refreshKey?: number }) {
  const lane = useLane(refreshKey);
  const tugged = useAsync(() => getTuggedTonight(beast.account_id), [beast.account_id, refreshKey]);
  // "While you were away": editions since the night this Beast was last looked at on this device.
  // Read once when the guide mounts (the alley only renders on the client, after sign-in).
  const [since] = useState(() => readLastSeen(beast.token_id));

  const night = lane.data?.market.night.night;
  useEffect(() => {
    if (night === undefined) return;
    try {
      localStorage.setItem(LAST_SEEN(beast.token_id), String(night));
    } catch {}
  }, [night, beast.token_id]);

  if (!lane.data)
    return (
      <Dialog name="Sister Clove" portrait="merchant-clove" className="mt-3">
        <p>{lane.error ? "The Lane is quiet tonight. Ask me again in a moment." : "Let me have a look around the Lane…"}</p>
      </Dialog>
    );
  const { market, ledger } = lane.data;
  const advice = cloveAdvice({
    beast,
    items,
    tugged: tugged.data,
    tugsNeeded: Math.max(0, market.yarn.target_tonight - market.yarn.tugs_tonight),
    alleyLives: market.yarn.lives,
    requests: market.requests,
  });
  const away: Edition[] = since !== null && night !== undefined && night > since ? ledger.filter((e) => e.night >= since) : [];

  return (
    <div className="flex flex-col gap-6">
      {away.length > 0 && (
        <section className="card flex gap-3 p-4">
          <Art slot="ui-ledger" alt="" size={52} className="shrink-0" style={{ alignSelf: "flex-start" }} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="title-3d text-sm">While you were away · {night! - since!} night{night! - since! === 1 ? "" : "s"}</p>
            <ul className="flex flex-col gap-0.5">
              {away.slice(0, 4).map((e) => (
                <li key={e.night}>
                  <span className="text-mist">Night {e.night}:</span> {e.headline.text}
                </li>
              ))}
            </ul>
            <Link href="/ledger" className="btn btn-ghost btn-sm mt-1 self-start">
              Read the Ledger
            </Link>
          </div>
        </section>
      )}
      <Dialog name="Sister Clove" portrait="merchant-clove" className="mt-3">
        <ul className="flex flex-col gap-2.5">
          {advice.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex-1">{a.text}</span>
              {a.href && (
                <Link href={a.href} scroll={false} className="btn btn-lantern btn-sm shrink-0">
                  {a.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
