// Portrait, name, nine-link tail and marks for one Beast.
import type { Beast } from "@/lib/chain";
import { catSlot, markSlot, type Expression } from "@/lib/ui/art";
import { formatDate, shortAccount } from "@/lib/ui/format";
import Art from "./Art";
import ChainTail from "./ChainTail";
import { Pill } from "./ui";

export function moodFor(b: Beast): Expression {
  if (!b.woken) return "sleepy";
  if (b.lives <= 0) return "sleepy";
  if (b.wander) return "curious";
  if (b.lives <= 3) return "angry";
  if (b.lives >= 8) return "happy";
  return "neutral";
}

export function Marks({ beast, size = 36 }: { beast: Beast; size?: number }) {
  if (!beast.marks.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Marks">
      {beast.marks.map((m, i) => (
        <li key={`${m.at_ms}-${i}`} title={`${m.kind.replace("-", " ")}: ${m.note} (${formatDate(m.at_ms)})`} className="flex items-center gap-1 rounded-full border-2 border-[#1a0b2e] bg-[#2f2370] py-0.5 pl-0.5 pr-2 font-display text-xs tracking-wide text-paper/90">
          <Art slot={markSlot(m.kind)} size={size * 0.6} className="rounded-full" alt="" />
          {m.kind.replace("-", " ")}
        </li>
      ))}
    </ul>
  );
}

export default function BeastCard({ beast, expression, children, size = 160 }: { beast: Beast; expression?: Expression; children?: React.ReactNode; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative shrink-0">
        <Art slot={catSlot(expression ?? moodFor(beast))} size={size} className="rounded-3xl" alt={`${beast.name}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h2 className="title-3d text-3xl">{beast.name}</h2>
          {beast.legend && <Pill tone="legend">★ Legend</Pill>}
          {beast.wander && <Pill tone="lantern">wandering</Pill>}
          {beast.woken && beast.lives <= 0 && <Pill tone="ember">resting</Pill>}
        </div>
        <ChainTail lives={beast.lives} legend={beast.legend} size="md" />
        <p className="text-xs text-mist">
          {beast.lives}/9 lives · made by {shortAccount(beast.maker)} · born {formatDate(beast.born_ms)}
        </p>
        <Marks beast={beast} />
        {children}
      </div>
    </div>
  );
}
