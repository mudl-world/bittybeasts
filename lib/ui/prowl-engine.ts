// Prowl: a 30-second rooftop runner. Pure game logic + canvas drawing, no React.
// Coordinates: logical canvas W×H, world x grows to the right, y grows down.
import type { Item, Stats } from "@/lib/chain";
import { artSrc, itemSlot, type ArtSlot } from "./art";

export const W = 800;
export const H = 360;
export const RUN_SECONDS = 30;
const CAT_X = 150; // cat's screen x
const CAT_W = 112;
const CAT_H = 84;
const GRAVITY = 2300;
const JUMP_V = 780;
const COYOTE = 0.09;

export type MerchantKey = "tom" | "miso" | "bandit" | "clove";
const AWNING_LOOT: Record<MerchantKey, Item> = { tom: "fish", miso: "button", bandit: "bell", clove: "catnip" };
const AWNING_COLORS: Record<MerchantKey, [string, string]> = {
  tom: ["#3d7dd8", "#fff3dc"],
  miso: ["#e0567a", "#fff3dc"],
  bandit: ["#333", "#ffb547"],
  clove: ["#3f9a62", "#fff3dc"],
};

type Roof = { x: number; w: number; top: number; id: number; windows: number[] };
type Pickup = { x: number; y: number; item: Item; taken: boolean; kind: "roof" | "ledge"; awning?: MerchantKey; fallV?: number; knocked?: boolean };
type Rat = { x: number; y: number; state: "run" | "bound" | "gone"; stole: boolean; t: number };
type Floater = { x: number; y: number; text: string; t: number; color: string };

export type EndReason = "time" | "fell" | "cashout" | "quit";

export type Game = {
  daring: boolean;
  stats: Stats;
  t: number;
  scroll: number;
  speed: number;
  y: number; // cat feet y
  vy: number;
  grounded: boolean;
  airTime: number;
  roofs: Roof[];
  nextRoofId: number;
  landedOn: Set<number>;
  rooftops: number;
  pickups: Pickup[];
  rats: Rat[];
  nextRatAt: number;
  floaters: Floater[];
  haul: Record<Item, number>;
  whips: Record<MerchantKey, number>;
  binds: number;
  whipFx: number;
  whipCooldown: number;
  binding: boolean;
  falling: boolean;
  over: EndReason | null;
  rng: () => number;
  jumpLen: number;
};

export type Input = { jump: boolean; whip: boolean; bind: boolean };

const emptyHaul = (): Record<Item, number> => ({ fish: 0, button: 0, bell: 0, moonstone: 0, charm: 0, catnip: 0, lantern: 0, hat: 0, scarf: 0, bow: 0, glasses: 0 });

export function reachPx(s: Stats) {
  return 90 + s.reach * 14;
}
export function bindWindowPx(s: Stats) {
  return 36 + s.grip * 9;
}
function gravityFor(s: Stats) {
  return GRAVITY * (1.12 - s.speed * 0.024);
}
export function rareChance(s: Stats) {
  return 0.05 + s.luck * 0.02;
}

export function multiplier(g: Pick<Game, "daring" | "rooftops">) {
  return g.daring ? 1 + g.rooftops * 0.15 : 1;
}

export function createGame(daring: boolean, stats: Stats, rng: () => number = Math.random): Game {
  const speed = daring ? 330 : 270;
  const airtime = (2 * JUMP_V) / gravityFor(stats);
  const g: Game = {
    daring,
    stats,
    t: 0,
    scroll: 0,
    speed,
    y: 260,
    vy: 0,
    grounded: true,
    airTime: 0,
    roofs: [],
    nextRoofId: 0,
    landedOn: new Set(),
    rooftops: 0,
    pickups: [],
    rats: [],
    nextRatAt: 3 + rng() * 3,
    floaters: [],
    haul: emptyHaul(),
    whips: { tom: 0, miso: 0, bandit: 0, clove: 0 },
    binds: 0,
    whipFx: 0,
    whipCooldown: 0,
    binding: false,
    falling: false,
    over: null,
    rng,
    jumpLen: speed * airtime,
  };
  // A long, flat starting roof so nobody falls in the first second.
  g.roofs.push({ x: -100, w: 760, top: 260, id: g.nextRoofId++, windows: windowsFor(rng) });
  g.landedOn.add(0);
  while (lastRoofEnd(g) < W * 2.5) addRoof(g);
  return g;
}

function windowsFor(rng: () => number) {
  return Array.from({ length: 8 }, () => rng());
}

function lastRoofEnd(g: Game) {
  const r = g.roofs[g.roofs.length - 1];
  return r.x + r.w;
}

function addRoof(g: Game) {
  const r = g.rng;
  const prev = g.roofs[g.roofs.length - 1];
  const progress = Math.min(1, g.t / RUN_SECONDS);
  const [gMin, gMax] = g.daring ? [0.45 + progress * 0.1, 0.72 + progress * 0.1] : [0.18, 0.4];
  const gap = g.jumpLen * (gMin + r() * (gMax - gMin));
  const w = g.daring ? 170 + r() * 170 : 280 + r() * 220;
  const dy = g.daring ? (r() - 0.5) * 120 : (r() - 0.5) * 36;
  const top = Math.max(g.daring ? 175 : 235, Math.min(g.daring ? 295 : 285, prev.top + dy));
  const roof: Roof = { x: prev.x + prev.w + gap, w, top, id: g.nextRoofId++, windows: windowsFor(r) };
  g.roofs.push(roof);

  // Roof-top pickups.
  const n = g.daring ? 1 + Math.floor(r() * 3) : Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    let item: Item = r() < 0.55 ? "fish" : "button";
    if (g.daring && r() < rareChance(g.stats)) item = r() < 0.6 ? "bell" : "moonstone";
    if (!g.daring && r() < 0.03) item = "catnip";
    g.pickups.push({ x: roof.x + 40 + ((i + r() * 0.5) / Math.max(1, n)) * (w - 80), y: top - 18, item, taken: false, kind: "roof" });
  }
  // Ledges / windowsills above the roof: only the Chain Whip reaches them. Some are awnings.
  if (r() < 0.75) {
    const awning = r() < 0.3 ? (["tom", "miso", "bandit", "clove"] as const)[Math.floor(r() * 4)] : undefined;
    let item: Item = awning ? AWNING_LOOT[awning] : r() < 0.5 ? "button" : "fish";
    if (!awning && r() < rareChance(g.stats) * (g.daring ? 1 : 0.4)) item = "bell";
    g.pickups.push({ x: roof.x + w * (0.3 + r() * 0.5), y: top - 120 - r() * 30, item, taken: false, kind: "ledge", awning });
  }
}

function roofUnder(g: Game, wx: number): Roof | undefined {
  return g.roofs.find((rf) => wx >= rf.x && wx <= rf.x + rf.w);
}

function float(g: Game, text: string, color = "#ffb547", x = CAT_X, y?: number) {
  g.floaters.push({ x, y: y ?? g.y - CAT_H - 6, text, t: 0, color });
}

function addHaul(g: Game, item: Item, n = 1) {
  g.haul[item] += n;
}

export function step(g: Game, dt: number, input: Input) {
  if (g.over) return;
  g.t += dt;
  g.speed += dt * (g.daring ? 5 : 3);
  g.scroll += g.speed * dt;
  g.whipFx = Math.max(0, g.whipFx - dt);
  g.whipCooldown = Math.max(0, g.whipCooldown - dt);
  g.binding = input.bind && !g.falling;
  const catWX = g.scroll + CAT_X;

  // Jump (Chain Dash).
  if (input.jump && !g.falling && (g.grounded || g.airTime < COYOTE) && g.vy >= 0) {
    g.vy = -JUMP_V;
    g.grounded = false;
    g.airTime = COYOTE;
  }

  // Gravity + landing.
  const prevY = g.y;
  g.vy += gravityFor(g.stats) * dt;
  g.y += g.vy * dt;
  const roof = roofUnder(g, catWX);
  g.grounded = false;
  if (!g.falling && roof && g.vy >= 0 && prevY <= roof.top + 2 && g.y >= roof.top) {
    g.y = roof.top;
    g.vy = 0;
    g.grounded = true;
    g.airTime = 0;
    if (!g.landedOn.has(roof.id)) {
      g.landedOn.add(roof.id);
      g.rooftops += 1;
      if (g.daring) float(g, `Rooftop ${g.rooftops} · ×${multiplier(g).toFixed(2)}`, "#ffd95e");
    }
  } else {
    g.airTime += dt;
  }
  // Below the surface of the roof underneath (hit its wall) or below any roof (dropped down a gap).
  if (!g.grounded && !g.falling && g.y > (roof ? roof.top : 300) + 8) g.falling = true;
  if (g.falling && g.y > H + CAT_H) {
    g.over = "fell";
    return;
  }

  // Chain Whip.
  if (input.whip && g.whipCooldown === 0 && !g.falling) {
    g.whipFx = 0.22;
    g.whipCooldown = 0.35;
    const reach = reachPx(g.stats);
    let hit = 0;
    for (const p of g.pickups) {
      if (p.taken || p.kind !== "ledge") continue;
      const dx = p.x - catWX;
      if (dx > -20 && dx < reach && Math.abs(p.y - (g.y - CAT_H)) < 160) {
        p.taken = true;
        p.knocked = true;
        p.fallV = -120;
        hit++;
        addHaul(g, p.item);
        if (p.awning) {
          g.whips[p.awning] += 1;
          float(g, `Mischief! ${cap(p.awning)}'s awning · +1 ${p.item}`, "#ff8a1f", CAT_X + dx, p.y);
        } else {
          float(g, `+1 ${p.item}`, "#ffb547", CAT_X + dx, p.y);
        }
      }
    }
    if (!hit) float(g, "whoosh", "#a9a4e0", CAT_X + 60, g.y - CAT_H);
  }

  // Run-over pickups.
  for (const p of g.pickups) {
    if (p.taken) {
      if (p.knocked && p.fallV !== undefined) {
        p.fallV += 1400 * dt;
        p.y += p.fallV * dt;
      }
      continue;
    }
    const dx = p.x - catWX;
    if (Math.abs(dx) < CAT_W * 0.45 && p.y > g.y - CAT_H - 10 && p.y < g.y + 10) {
      p.taken = true;
      addHaul(g, p.item);
      float(g, `+1 ${p.item}`, p.item === "bell" || p.item === "moonstone" ? "#ffd95e" : "#ffb547");
    }
  }

  // Rats.
  if (g.t >= g.nextRatAt && g.t < RUN_SECONDS - 2) {
    const wx = g.scroll + W + 20;
    const rf = roofUnder(g, wx) ?? g.roofs[g.roofs.length - 1];
    g.rats.push({ x: wx, y: rf.top, state: "run", stole: false, t: 0 });
    g.nextRatAt = g.t + (g.daring ? 3.5 : 4.5) + g.rng() * 4;
  }
  const window = bindWindowPx(g.stats);
  for (const rat of g.rats) {
    rat.t += dt;
    if (rat.state === "gone") continue;
    if (rat.state === "bound") {
      // Dragged along on the chain for a moment, then let go.
      rat.x = catWX + 30;
      rat.y = g.y;
      if (rat.t > 0.6) rat.state = "gone";
      continue;
    }
    rat.x -= 150 * dt;
    const rf = roofUnder(g, rat.x);
    if (rf) rat.y = rf.top;
    const dx = rat.x - catWX;
    if (g.binding && Math.abs(dx) < window && Math.abs(rat.y - g.y) < 70) {
      rat.state = "bound";
      rat.t = 0;
      g.binds += 1;
      const loot: Item = g.rng() < 0.5 ? "button" : "fish";
      addHaul(g, loot, 2);
      float(g, `Bound a rat! Goods returned · +2 ${loot}`, "#7ed6a0");
    } else if (!rat.stole && dx < -10 && Math.abs(rat.y - g.y) < 50) {
      rat.stole = true;
      const have = (Object.keys(g.haul) as Item[]).filter((k) => g.haul[k] > 0);
      if (have.length) {
        const k = have[Math.floor(g.rng() * have.length)];
        g.haul[k] -= 1;
        float(g, `A rat nicked a ${k}!`, "#ff5e3a");
      }
    }
    if (rat.x < g.scroll - 80) rat.state = "gone";
  }

  // Floaters.
  for (const f of g.floaters) {
    f.t += dt;
    f.y -= 30 * dt;
  }
  g.floaters = g.floaters.filter((f) => f.t < 1.4);

  // Recycle world.
  while (lastRoofEnd(g) < g.scroll + W * 2) addRoof(g);
  g.roofs = g.roofs.filter((r) => r.x + r.w > g.scroll - 200);
  g.pickups = g.pickups.filter((p) => p.x > g.scroll - 100 && p.y < H + 50);
  g.rats = g.rats.filter((r) => r.state !== "gone");

  if (g.t >= RUN_SECONDS) g.over = "time";
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

/** Final haul as the chain expects it: [item, amount][] (daring hauls are multiplied by rooftops). */
export function finalHaul(g: Game): [Item, number][] {
  const m = multiplier(g);
  return (Object.entries(g.haul) as [Item, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => [k, Math.max(1, Math.round(n * m))]);
}

// ---------------- drawing ----------------

export type Sprites = Partial<Record<ArtSlot, HTMLImageElement>>;

export const SPRITE_SLOTS: ArtSlot[] = [
  "cat-run-1",
  "cat-run-2",
  "cat-run-3",
  "cat-run-4",
  "cat-fall",
  "cat-whip",
  "cat-bind",
  "rat-thief",
  "rooftop-left",
  "rooftop-mid",
  "rooftop-right",
  "alley-bg",
  "item-fish",
  "item-button",
  "item-bell",
  "item-moonstone",
  "item-catnip",
];

export function loadSprites(): Sprites {
  const out: Sprites = {};
  for (const slot of SPRITE_SLOTS) {
    const img = new Image();
    img.src = artSrc(slot);
    out[slot] = img;
  }
  return out;
}

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

function skyline(ctx: CanvasRenderingContext2D, scroll: number, factor: number, color: string, base: number, seed: number) {
  ctx.fillStyle = color;
  const off = (scroll * factor) % 120;
  for (let i = -1; i < W / 60 + 2; i++) {
    const k = Math.floor((scroll * factor) / 120) + i;
    const h = 40 + (((k * 9301 + seed * 49297) % 233280) / 233280) * 90;
    ctx.fillRect(i * 120 - off, base - h, 96, h + 200);
  }
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, sp: Sprites, opts: { reduced?: boolean } = {}) {
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0c0a26");
  sky.addColorStop(0.7, "#211d57");
  sky.addColorStop(1, "#332d7a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff3dc";
  ctx.beginPath();
  ctx.arc(660, 60, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0c0a26";
  ctx.beginPath();
  ctx.arc(672, 52, 22, 0, Math.PI * 2);
  ctx.fill();

  // The artist's skyline, full height, scrolling slowly. Every other copy is mirrored so the
  // edges always meet (the painting isn't tileable on its own).
  const bg = sp["alley-bg"];
  if (ready(bg)) {
    const bw = (bg.naturalWidth / bg.naturalHeight) * H;
    const pos = g.scroll * 0.15;
    const first = Math.floor(pos / bw);
    for (let k = first; k * bw - pos < W; k++) {
      const x = k * bw - pos;
      if (k % 2 === 0) ctx.drawImage(bg, x, 0, bw, H);
      else {
        ctx.save();
        ctx.translate(x + bw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(bg, 0, 0, bw, H);
        ctx.restore();
      }
    }
  } else {
    skyline(ctx, g.scroll, 0.25, "#1a1647", 300, 1);
    skyline(ctx, g.scroll, 0.5, "#14113a", 330, 7);
  }

  // Roofs.
  const roofL = sp["rooftop-left"];
  const roofM = sp["rooftop-mid"];
  const roofR = sp["rooftop-right"];
  for (const r of g.roofs) {
    const x = r.x - g.scroll;
    if (x > W || x + r.w < 0) continue;
    ctx.fillStyle = "#0b0920";
    ctx.fillRect(x, r.top, r.w, H - r.top);
    // Warm windows.
    for (let i = 0; i < r.windows.length; i++) {
      const wx = x + 18 + ((i * 53) % Math.max(30, r.w - 36));
      const wy = r.top + 40 + Math.floor(i / 3) * 34;
      if (wy > H - 10) continue;
      ctx.fillStyle = r.windows[i] > 0.55 ? "rgba(255,181,71,0.75)" : "rgba(169,164,224,0.12)";
      ctx.fillRect(wx, wy, 14, 18);
    }
    if (ready(roofL) && ready(roofM) && ready(roofR)) {
      // Left cap, repeating middle, right cap: the top edge of the art is the surface the cat walks on.
      const th = 40;
      const wOf = (img: HTMLImageElement) => (img.naturalWidth / img.naturalHeight) * th;
      const lw = Math.min(wOf(roofL), r.w / 2);
      const rw = Math.min(wOf(roofR), r.w / 2);
      const mw = wOf(roofM);
      const y = r.top - 6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + lw, y, Math.max(0, r.w - lw - rw), th);
      ctx.clip();
      for (let tx = x + lw; tx < x + r.w - rw; tx += mw) ctx.drawImage(roofM, tx, y, mw, th);
      ctx.restore();
      ctx.drawImage(roofL, 0, 0, roofL.naturalWidth * (lw / wOf(roofL)), roofL.naturalHeight, x, y, lw, th);
      ctx.drawImage(roofR, roofR.naturalWidth * (1 - rw / wOf(roofR)), 0, roofR.naturalWidth * (rw / wOf(roofR)), roofR.naturalHeight, x + r.w - rw, y, rw, th);
    } else {
      ctx.fillStyle = "#332d7a";
      ctx.fillRect(x, r.top - 4, r.w, 10);
      ctx.fillStyle = "#4b44a3";
      ctx.fillRect(x, r.top - 4, r.w, 3);
    }
  }

  // Ledges + awnings + pickups.
  for (const p of g.pickups) {
    const x = p.x - g.scroll;
    if (x < -60 || x > W + 60) continue;
    if (p.kind === "ledge" && !p.knocked) {
      if (p.awning) {
        const [a, b] = AWNING_COLORS[p.awning];
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? b : a;
          ctx.beginPath();
          ctx.moveTo(x - 36 + i * 12, p.y + 14);
          ctx.lineTo(x - 36 + (i + 1) * 12, p.y + 14);
          ctx.lineTo(x - 36 + (i + 1) * 12, p.y + 26);
          ctx.arc(x - 30 + i * 12, p.y + 26, 6, 0, Math.PI);
          ctx.fill();
        }
        ctx.fillStyle = "#fff3dc";
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(cap(p.awning), x, p.y + 42);
      } else {
        ctx.fillStyle = "#6b6399";
        ctx.fillRect(x - 26, p.y + 14, 52, 6);
      }
    }
    if (p.taken && !p.knocked) continue;
    const img = sp[itemSlot(p.item)];
    const s = p.kind === "ledge" ? 26 : 24;
    if (ready(img)) ctx.drawImage(img, x - s / 2, p.y - s / 2, s, s);
    else {
      ctx.fillStyle = "#ffb547";
      ctx.beginPath();
      ctx.arc(x, p.y, s / 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Rats.
  const rat = sp["rat-thief"];
  for (const r of g.rats) {
    const x = r.x - g.scroll;
    const rw = 54;
    const rh = 36;
    if (ready(rat)) ctx.drawImage(rat, x - rw / 2, r.y - rh, rw, rh);
    else {
      ctx.fillStyle = "#6b6399";
      ctx.fillRect(x - rw / 2, r.y - rh, rw, rh);
    }
    if (r.state === "bound") {
      ctx.strokeStyle = "#ffb547";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(x, r.y - rh / 2, rw * 0.6, rh * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Bind window hint.
  if (g.binding) {
    ctx.strokeStyle = "rgba(126,214,160,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.ellipse(CAT_X, g.y - CAT_H / 2, bindWindowPx(g.stats), CAT_H * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Whip arc.
  if (g.whipFx > 0) {
    const reach = reachPx(g.stats);
    ctx.strokeStyle = `rgba(255,181,71,${Math.min(1, g.whipFx * 6)})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(CAT_X - 20, g.y - CAT_H * 0.4);
    ctx.quadraticCurveTo(CAT_X + reach * 0.5, g.y - CAT_H - 140, CAT_X + reach, g.y - CAT_H - 60);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Cat.
  let slot: ArtSlot = `cat-run-${(Math.floor(g.t * (opts.reduced ? 4 : 12)) % 4) + 1}` as ArtSlot;
  if (!g.grounded) slot = "cat-run-2";
  if (g.binding) slot = "cat-bind";
  if (g.whipFx > 0) slot = "cat-whip";
  if (g.falling) slot = "cat-fall";
  const cat = sp[slot];
  if (ready(cat)) ctx.drawImage(cat, CAT_X - CAT_W / 2, g.y - CAT_H, CAT_W, CAT_H);
  else {
    ctx.fillStyle = "#1d1a3f";
    ctx.fillRect(CAT_X - CAT_W / 2, g.y - CAT_H, CAT_W, CAT_H);
  }

  // Floaters.
  ctx.textAlign = "center";
  ctx.font = "700 15px system-ui, sans-serif";
  for (const f of g.floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
    ctx.fillStyle = "#06051a";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
