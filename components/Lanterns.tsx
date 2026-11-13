// Nine paper lanterns strung over a stall. Lit = still trading. All out = lights out.

type Props = { lit: number; max?: number; size?: number; className?: string };

export default function Lanterns({ lit, max = 9, size = 14, className = "" }: Props) {
  const n = Math.max(0, Math.min(max, lit));
  const w = size;
  const h = size * 1.4;
  const gap = size * 0.45;
  const total = max * w + (max - 1) * gap;
  return (
    <svg
      role="img"
      aria-label={`${n} of ${max} lanterns lit`}
      viewBox={`0 -4 ${total} ${h + 6}`}
      width={total}
      height={h + 6}
      className={`max-w-full ${className}`}
    >
      <title>{`${n} of ${max} lanterns lit`}</title>
      <path d={`M0 0 Q ${total / 2} ${size * 0.5} ${total} 0`} stroke="#6b6399" strokeWidth={1} fill="none" />
      {Array.from({ length: max }, (_, i) => {
        const on = i < n;
        const x = i * (w + gap);
        const sag = Math.sin((i / (max - 1)) * Math.PI) * size * 0.25;
        return (
          <g key={i} transform={`translate(${x} ${sag})`} className={on ? "animate-flicker" : undefined} style={{ animationDelay: `${(i * 0.37) % 2}s` }}>
            <line x1={w / 2} y1={-2} x2={w / 2} y2={2} stroke="#6b6399" strokeWidth={1} />
            <rect x={w * 0.3} y={1} width={w * 0.4} height={h * 0.08} rx={1} fill={on ? "#c98a2e" : "#3a3566"} />
            <rect x={0} y={h * 0.12} width={w} height={h * 0.72} rx={w * 0.45} fill={on ? "#ffb547" : "#262150"} stroke={on ? "#ff8a1f" : "#3a3566"} strokeWidth={1} />
            <line x1={1} y1={h * 0.4} x2={w - 1} y2={h * 0.4} stroke={on ? "#ff8a1f" : "#3a3566"} strokeWidth={0.8} />
            <line x1={1} y1={h * 0.58} x2={w - 1} y2={h * 0.58} stroke={on ? "#ff8a1f" : "#3a3566"} strokeWidth={0.8} />
            <rect x={w * 0.3} y={h * 0.84} width={w * 0.4} height={h * 0.08} rx={1} fill={on ? "#c98a2e" : "#3a3566"} />
          </g>
        );
      })}
    </svg>
  );
}
