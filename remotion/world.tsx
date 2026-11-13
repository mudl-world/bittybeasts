// The world of Lantern Lane, drawn in code: every layer is an SVG group in a 1920x1080 frame,
// animated from the current frame. No cats here; cats are the artist's art slots (see Cat in scenes.tsx).
import { interpolate, random } from "remotion";
import { COLORS as C } from "./script";

const W = 1920;
const H = 1080;

// ---- Sky -----------------------------------------------------------------------------------

export function Sky({ frame, moon = true }: { frame: number; moon?: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.night950} />
          <stop offset="0.6" stopColor={C.night800} />
          <stop offset="1" stopColor={C.night700} />
        </linearGradient>
        <radialGradient id="moonGlow">
          <stop offset="0" stopColor="#fff1c9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff1c9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {Array.from({ length: 90 }, (_, i) => {
        const x = random(`sx${i}`) * W;
        const y = random(`sy${i}`) * H * 0.55;
        const r = 0.8 + random(`sr${i}`) * 1.8;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame / (14 + random(`st${i}`) * 20) + i));
        return <circle key={i} cx={x} cy={y} r={r} fill={C.paper} opacity={tw} />;
      })}
      {moon && (
        <g>
          <mask id="crescent">
            <rect width={W} height={H} fill="white" />
            <circle cx={1556} cy={186} r={68} fill="black" />
          </mask>
          <circle cx={1520} cy={210} r={230} fill="url(#moonGlow)" />
          <circle cx={1520} cy={210} r={78} fill="#fff1c9" mask="url(#crescent)" />
        </g>
      )}
    </g>
  );
}

// ---- Skyline -------------------------------------------------------------------------------

type Building = { x: number; w: number; h: number; roof: number; windows: { x: number; y: number; t: number }[] };

function buildings(seed: string, count: number, minH: number, maxH: number, minW: number, maxW: number): Building[] {
  const out: Building[] = [];
  let x = -80;
  for (let i = 0; x < W + 200 && i < count; i++) {
    const w = minW + random(`${seed}w${i}`) * (maxW - minW);
    const h = minH + random(`${seed}h${i}`) * (maxH - minH);
    const windows: Building["windows"] = [];
    const cols = Math.max(1, Math.floor((w - 24) / 34));
    const rows = Math.max(1, Math.floor((h - 60) / 46));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (random(`${seed}win${i}-${r}-${c}`) < 0.45) continue;
        windows.push({ x: x + 16 + c * 34, y: H - h + 40 + r * 46, t: random(`${seed}t${i}-${r}-${c}`) });
      }
    out.push({ x, w, h, roof: Math.floor(random(`${seed}r${i}`) * 4), windows });
    x += w + 6 + random(`${seed}g${i}`) * 18;
  }
  return out;
}

const FAR = buildings("far", 40, 260, 520, 70, 150);
const NEAR = buildings("near", 24, 200, 420, 130, 240);

/** windowsLit: 1 = every window lit, 0 = the city is asleep. */
export function Skyline({ layer, shift = 0, windowsLit = 0, y = 0 }: { layer: "far" | "near"; shift?: number; windowsLit?: number; y?: number }) {
  const list = layer === "far" ? FAR : NEAR;
  const fill = layer === "far" ? C.night700 : C.night900;
  return (
    <g transform={`translate(${shift} ${y})`}>
      {list.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={H - b.h} width={b.w} height={b.h + 40} fill={fill} />
          {layer === "near" && b.roof === 1 && <rect x={b.x + b.w * 0.6} y={H - b.h - 34} width={22} height={34} fill={fill} />}
          {layer === "near" && b.roof === 2 && (
            <g fill={fill}>
              <rect x={b.x + b.w * 0.25} y={H - b.h - 58} width={50} height={40} rx={6} />
              <rect x={b.x + b.w * 0.25 + 6} y={H - b.h - 18} width={6} height={18} />
              <rect x={b.x + b.w * 0.25 + 38} y={H - b.h - 18} width={6} height={18} />
            </g>
          )}
          {layer === "near" && b.roof === 3 && <path d={`M${b.x - 6} ${H - b.h} L${b.x + b.w / 2} ${H - b.h - 50} L${b.x + b.w + 6} ${H - b.h} Z`} fill={fill} />}
          {b.windows.map((w, j) => (
            <rect
              key={j}
              x={w.x}
              y={w.y}
              width={layer === "far" ? 14 : 18}
              height={layer === "far" ? 20 : 24}
              rx={2}
              fill={w.t < windowsLit ? C.lantern : C.night600}
              opacity={w.t < windowsLit ? 0.9 : layer === "far" ? 0.35 : 0.5}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

// ---- Lanterns ------------------------------------------------------------------------------

export function Lantern({ x, y, size = 1, lit = 1, sway = 0, color = C.lantern }: { x: number; y: number; size?: number; lit?: number; sway?: number; color?: string }) {
  const glow = `lg-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${sway}) scale(${size})`}>
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor={color} stopOpacity={0.7 * lit} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <line x1={0} y1={-26} x2={0} y2={0} stroke="#2a2550" strokeWidth={3} />
      <circle cx={0} cy={40} r={90} fill={`url(#${glow})`} />
      <rect x={-14} y={0} width={28} height={8} rx={2} fill="#3a2a1a" />
      <ellipse cx={0} cy={40} rx={30} ry={34} fill={lit > 0.05 ? color : "#3b3566"} opacity={0.35 + 0.65 * Math.max(lit, 0.2)} />
      <path d="M-30 40 Q0 60 30 40 M-28 28 Q0 44 28 28 M-28 52 Q0 68 28 52" stroke="#00000033" strokeWidth={2} fill="none" />
      <rect x={-12} y={72} width={24} height={7} rx={2} fill="#3a2a1a" />
      <line x1={0} y1={79} x2={0} y2={96} stroke={color} strokeWidth={2} opacity={0.7} />
    </g>
  );
}

/** A string of lanterns hanging from a sagging line between two points. */
export function LanternString({ x1, y1, x2, y2, sag, count, frame, litFrom = -1, litEvery = 6, seed = "ls", stroke = "#2a2550", width = 3, drawn = 1 }: { x1: number; y1: number; x2: number; y2: number; sag: number; count: number; frame: number; litFrom?: number; litEvery?: number; seed?: string; stroke?: string; width?: number; drawn?: number }) {
  const point = (t: number) => {
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t + sag * 4 * t * (1 - t);
    return { x, y };
  };
  const mid = point(0.5);
  return (
    <g>
      <path d={`M${x1} ${y1} Q${mid.x} ${y1 + (y2 - y1) / 2 + sag * 2} ${x2} ${y2}`} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - drawn} />
      {Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / (count + 1);
        if (drawn < 1 && t > drawn) return null;
        const p = point(t);
        const lit = litFrom < 0 ? 1 : interpolate(frame, [litFrom + i * litEvery, litFrom + i * litEvery + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const sway = Math.sin(frame / 22 + random(`${seed}${i}`) * 6) * 4;
        return <Lantern key={i} x={p.x} y={p.y + 4} size={0.6} lit={lit} sway={sway} color={i % 3 === 1 ? C.lanternDeep : C.lantern} />;
      })}
    </g>
  );
}

// ---- The kiln ------------------------------------------------------------------------------

export function Kiln({ frame }: { frame: number }) {
  const pulse = 0.75 + 0.25 * Math.sin(frame / 9) + 0.08 * Math.sin(frame / 3.3);
  return (
    <g>
      <defs>
        <radialGradient id="fire" cx="0.5" cy="0.75" r="0.7">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset="0.35" stopColor={C.lantern} />
          <stop offset="0.75" stopColor={C.ember} />
          <stop offset="1" stopColor="#5a1a10" />
        </radialGradient>
        <radialGradient id="kilnLight" cx="0.5" cy="0.62" r="0.6">
          <stop offset="0" stopColor={C.lanternDeep} stopOpacity={0.45 * pulse} />
          <stop offset="1" stopColor={C.lanternDeep} stopOpacity={0} />
        </radialGradient>
        <pattern id="bricks" width="64" height="32" patternUnits="userSpaceOnUse">
          <rect width="64" height="32" fill="#5b2f2a" />
          <path d="M0 16 H64 M32 0 V16 M0 16 V32 M64 16 V32" stroke="#3d1d1a" strokeWidth="3" />
        </pattern>
      </defs>
      {/* workshop wall and floor */}
      <rect width={W} height={H} fill="#1a1230" />
      <rect y={820} width={W} height={260} fill="#120c22" />
      {/* shelf with drying pots */}
      <rect x={140} y={360} width={420} height={14} rx={4} fill="#3a2a40" />
      {[180, 260, 350, 450].map((x, i) => (
        <path key={x} d={`M${x} 360 q-8 -${40 + i * 8} 22 -${48 + i * 8} q30 8 22 ${48 + i * 8} Z`} fill={i % 2 ? "#6b4a5a" : "#57405e"} />
      ))}
      <rect x={1360} y={420} width={380} height={14} rx={4} fill="#3a2a40" />
      {[1400, 1480, 1590, 1670].map((x, i) => (
        <rect key={x} x={x} y={420 - 30 - i * 6} width={40 + (i % 2) * 20} height={30 + i * 6} rx={10} fill={i % 2 ? "#6b4a5a" : "#57405e"} />
      ))}
      {/* the kiln dome */}
      <path d="M560 840 L560 520 Q560 250 960 250 Q1360 250 1360 520 L1360 840 Z" fill="url(#bricks)" />
      <path d="M560 840 L560 520 Q560 250 960 250 Q1360 250 1360 520 L1360 840" fill="none" stroke="#2a1414" strokeWidth={14} />
      <rect x={900} y={170} width={120} height={100} fill="#3d1d1a" />
      {/* the door and fire */}
      <path d="M800 840 L800 600 Q800 470 960 470 Q1120 470 1120 600 L1120 840 Z" fill="#200a08" />
      <path d="M820 840 L820 610 Q820 495 960 495 Q1100 495 1100 610 L1100 840 Z" fill="url(#fire)" opacity={pulse} />
      <rect width={W} height={H} fill="url(#kilnLight)" />
      {/* embers drifting up */}
      {Array.from({ length: 36 }, (_, i) => {
        const speed = 1.2 + random(`es${i}`) * 2.2;
        const life = 260;
        const t = ((frame * speed + random(`eo${i}`) * life) % life) / life;
        const x = 860 + random(`ex${i}`) * 200 + Math.sin(frame / 12 + i) * 24 * t;
        const y = 600 - t * 520;
        return <circle key={i} cx={x} cy={y} r={2 + random(`er${i}`) * 3} fill={i % 3 ? C.lantern : C.ember} opacity={(1 - t) * 0.9} />;
      })}
      {/* smoke from the flue */}
      {Array.from({ length: 6 }, (_, i) => {
        const t = ((frame + i * 40) % 240) / 240;
        return <circle key={i} cx={960 + Math.sin(t * 6 + i) * 30} cy={170 - t * 200} r={30 + t * 50} fill="#3a3358" opacity={(1 - t) * 0.35} />;
      })}
    </g>
  );
}

// ---- The keyring and the chain tail --------------------------------------------------------

export function Keyring({ x, y, frame }: { x: number; y: number; frame: number }) {
  const swing = Math.sin(frame / 25) * 3;
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing})`}>
      <defs>
        <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ece9ff" />
          <stop offset="0.5" stopColor="#8f8bc4" />
          <stop offset="1" stopColor="#d9d6f5" />
        </linearGradient>
      </defs>
      <circle cx={0} cy={0} r={70} fill="none" stroke="url(#metal)" strokeWidth={12} />
      <circle cx={0} cy={0} r={70} fill="none" stroke="#ffffff55" strokeWidth={2} strokeDasharray="40 400" />
      <rect x={-14} y={64} width={28} height={46} rx={10} fill="url(#metal)" />
      <rect x={-5} y={106} width={10} height={40} fill="url(#metal)" />
    </g>
  );
}

/** Nine chain links along a curve; `lit` is how many are lit (fractional fades the next one in). */
export function ChainTail({ x, y, lit, scale = 1, gold = false }: { x: number; y: number; lit: number; scale?: number; gold?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <radialGradient id="linkGlow">
          <stop offset="0" stopColor={gold ? "#ffe08a" : C.lantern} stopOpacity={0.8} />
          <stop offset="1" stopColor={C.lantern} stopOpacity={0} />
        </radialGradient>
      </defs>
      {Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        const px = i * 46;
        const py = Math.sin(t * Math.PI * 1.2) * -40 + t * t * 60;
        const on = Math.max(0, Math.min(1, lit - i));
        const vertical = i % 2 === 1;
        return (
          <g key={i} transform={`translate(${px} ${py}) rotate(${-20 + t * 50})`}>
            <circle r={34} fill="url(#linkGlow)" opacity={on} />
            <ellipse
              rx={vertical ? 9 : 22}
              ry={vertical ? 22 : 13}
              fill="none"
              stroke={on > 0.01 ? (gold ? "#ffd166" : C.lantern) : C.night600}
              strokeWidth={8}
              opacity={0.45 + 0.55 * Math.max(on, 0.15)}
            />
          </g>
        );
      })}
    </g>
  );
}

// ---- The Great Yarn ------------------------------------------------------------------------

export function YarnBall({ x, y, r, frame }: { x: number; y: number; r: number; frame: number }) {
  const rot = frame * 0.25;
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id="ballClip">
          <circle r={r} />
        </clipPath>
        <radialGradient id="ballShade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={C.yarnLight} />
          <stop offset="0.6" stopColor={C.yarn} />
          <stop offset="1" stopColor={C.yarnDark} />
        </radialGradient>
        <radialGradient id="ballGlow">
          <stop offset="0.5" stopColor={C.yarn} stopOpacity={0.35} />
          <stop offset="1" stopColor={C.yarn} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={r * 1.7} fill="url(#ballGlow)" />
      <circle r={r} fill="url(#ballShade)" />
      <g clipPath="url(#ballClip)" transform={`rotate(${rot})`}>
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={`a${i}`} rx={r * 1.05} ry={r * (0.15 + i * 0.07)} fill="none" stroke={C.yarnDark} strokeOpacity={0.45} strokeWidth={5} transform={`rotate(${35})`} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <ellipse key={`b${i}`} rx={r * (0.2 + i * 0.09)} ry={r * 1.05} fill="none" stroke={C.yarnLight} strokeOpacity={0.5} strokeWidth={4} transform={`rotate(${-25})`} />
        ))}
      </g>
      <circle r={r} fill="none" stroke={C.yarnDark} strokeWidth={4} />
    </g>
  );
}

/** A thread falling out of the ball and draping across the roofs; `drawn` 0..1 unspools it. */
export function Thread({ d, drawn, width = 6 }: { d: string; drawn: number; width?: number }) {
  return <path d={d} fill="none" stroke={C.yarn} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - drawn} />;
}

// ---- Lantern Lane ----------------------------------------------------------------------------

export const STALL_COLORS = [
  { a: "#3d6fb6", b: "#e8eefc" }, // Tom: fishmonger blue
  { a: "#d86b8f", b: "#fde6ee" }, // Miso: button pink
  { a: "#4a3a7a", b: "#2a2050" }, // Bandit: shady purple
  { a: "#4f9a72", b: "#e2f5ea" }, // Clove: healer green
];

export function Stall({ x, y, w, colors, frame, goods }: { x: number; y: number; w: number; colors: { a: string; b: string }; frame: number; goods: string }) {
  const stripes = 7;
  const sw = w / stripes;
  const flap = Math.sin(frame / 18 + x) * 3;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* posts */}
      <rect x={8} y={0} width={12} height={330} fill="#2c2148" />
      <rect x={w - 20} y={0} width={12} height={330} fill="#2c2148" />
      {/* awning */}
      {Array.from({ length: stripes }, (_, i) => (
        <path key={i} d={`M${i * sw} 0 H${(i + 1) * sw} V60 Q${(i + 0.5) * sw} ${86 + flap} ${i * sw} 60 Z`} fill={i % 2 ? colors.b : colors.a} />
      ))}
      <rect x={-6} y={-12} width={w + 12} height={14} rx={4} fill="#2c2148" />
      {/* counter */}
      <rect x={0} y={250} width={w} height={110} rx={6} fill="#3a2c5c" />
      <rect x={0} y={250} width={w} height={14} rx={4} fill="#4a3a74" />
      <text x={w / 2} y={320} textAnchor="middle" fontSize={30} fill="#ffffff22" fontWeight={700}>
        {goods}
      </text>
    </g>
  );
}

export function RatEyes({ x, y, frame, seed, scale = 1 }: { x: number; y: number; frame: number; seed: string; scale?: number }) {
  const period = 70 + Math.floor(random(`${seed}p`) * 60);
  const t = (frame + Math.floor(random(`${seed}o`) * period)) % period;
  const open = t < period - 6 ? 1 : 0.1;
  const look = Math.sin(frame / 30 + random(seed) * 6) * 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {[-16, 16].map((dx) => (
        <g key={dx}>
          <ellipse cx={dx} cy={0} rx={14} ry={14 * open} fill="#ff4d4d" opacity={0.25} />
          <ellipse cx={dx} cy={0} rx={8} ry={8 * open} fill="#ffd36b" />
          <ellipse cx={dx + look * 0.5} cy={0} rx={3} ry={6 * open} fill="#1a0f0a" />
        </g>
      ))}
    </g>
  );
}

export function Cobbles() {
  return (
    <g>
      <path d={`M0 ${H} L0 680 L${W} 680 L${W} ${H} Z`} fill="#1b1638" />
      {Array.from({ length: 7 }, (_, row) =>
        Array.from({ length: 18 }, (_, i) => {
          const y = 700 + row * 56;
          const w = 90 + row * 14;
          const x = i * (w + 10) - (row % 2) * (w / 2);
          return <rect key={`${row}-${i}`} x={x} y={y} width={w} height={40} rx={14} fill="#241d48" />;
        }),
      )}
    </g>
  );
}
