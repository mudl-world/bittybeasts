// The Beast's chained tail: nine links = nine lives. Lit links glow, lost lives go dark,
// and a legend's tail is gold. Used for the Beast, and (with label) for the alley's $YARN lives.
// Links are the artist's icons (ui-link-lit / ui-link-dark).
import { artSrc } from "@/lib/ui/art";

type Props = {
  lives: number;
  max?: number;
  legend?: boolean;
  /** Link index that just changed, to give it a pop. */
  flash?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const SIZES = { sm: 18, md: 28, lg: 40 } as const;

export default function ChainTail({ lives, max = 9, legend = false, flash = null, size = "md", className = "", label }: Props) {
  const u = SIZES[size];
  const lit = Math.max(0, Math.min(max, lives));
  const name = label ?? "Tail";
  return (
    <span role="img" aria-label={`${name}: ${lit} of ${max} links lit`} title={`${lit} of ${max} lives`} className={`inline-flex max-w-full items-center ${className}`}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < lit;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={artSrc(on ? "ui-link-lit" : "ui-link-dark")}
            alt=""
            width={u}
            height={u}
            draggable={false}
            className={flash === i ? "animate-pop" : undefined}
            style={{
              width: u,
              height: u,
              marginLeft: i === 0 ? 0 : -u * 0.22,
              transform: `rotate(${i % 2 ? 90 : 0}deg)`,
              filter: on && legend ? "hue-rotate(-12deg) saturate(1.4) brightness(1.15)" : on ? undefined : "opacity(0.85)",
            }}
          />
        );
      })}
    </span>
  );
}
