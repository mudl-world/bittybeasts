// Slices the artist's sprite sheets (public/sheets/*.png) into the game's art slots (public/art/*.png).
//   node scripts/slice-sheets.mjs
// Each group of frames is cropped with ONE shared box (the union of everything drawn in its cells),
// so animation frames keep the same scale and baseline. Backgrounds are already transparent.
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));
const ROOT = resolve(import.meta.dirname, "..");
const SHEETS = resolve(ROOT, "public/sheets");
const BG = resolve(ROOT, "public/bg");
const ART = resolve(ROOT, "public/art");

/** groups: which sheet, its grid, which cells, slot names, output size, crop mode. */
const GROUPS = [
  {
    sheet: "sheet1.png", cols: 4, rows: 2, out: [640, 960], mode: "union",
    slots: ["cat-neutral", "cat-happy", "cat-curious", "cat-surprised", "cat-angry", "cat-sleepy", "cat-talk", "cat-eat"],
  },
  {
    sheet: "sheet2.png", cols: 4, rows: 2, out: [512, 384], mode: "anchor", scaleFrom: [0, 1, 2, 3],
    slots: ["cat-run-1", "cat-run-2", "cat-run-3", "cat-run-4", "cat-fall", "cat-whip", "cat-bind", "cat-jump"],
  },
  {
    sheet: "sheet3.png", cols: 4, rows: 1, out: [512, 768], mode: "union",
    slots: ["merchant-tom", "merchant-miso", "merchant-bandit", "merchant-clove"],
  },
  { sheet: "sheet4.png", cols: 4, rows: 1, cells: [0], out: [384, 256], mode: "own", slots: ["rat-thief"] },
  { sheet: "sheet4.png", cols: 4, rows: 1, cells: [1, 2, 3], out: [256, 256], mode: "own", slots: ["mark-scar", "mark-bent-ear", "mark-patch"] },
  {
    sheet: "../bg/items.png", cols: 4, rows: 3, out: [256, 256], mode: "own",
    slots: ["item-fish", "item-button", "item-bell", "item-moonstone", "item-charm", "item-catnip", "item-lantern", "item-hat", "item-scarf", "item-bow", "item-glasses", "item-yarn"],
  },
  {
    sheet: "../bg/interfaceIcons.png", cols: 4, rows: 3, out: [256, 256], mode: "own",
    slots: ["ui-feed", "ui-wardrobe", "ui-talk", "ui-cuddle", "ui-persona", "ui-missions", "ui-lane", "ui-ledger", "ui-link-lit", "ui-link-dark", "ui-thought", "ui-verified"],
  },
  {
    // The sign-out arrow stands a little apart from its door: bridge wider gaps on this sheet.
    // Cut at the sheet's real gaps (the sign-out arrow crosses the even quarter line).
    sheet: "../bg/menuIcons.png", cols: 4, rows: 2, out: [256, 256], mode: "own", gap: 0.08,
    colEdges: [[0, 420, 809, 1128, 1536], [0, 435, 756, 1139, 1536]],
    slots: ["ui-home", "ui-signout", "ui-close", "ui-back", "ui-sound-on", "ui-sound-off", "ui-help", "ui-map"],
  },
];

async function load(file) {
  const { data, info } = await sharp(resolve(SHEETS, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/**
 * Bounding box of visible pixels inside a rect. Horizontally it keeps only the widest unbroken
 * stretch of columns, so a stray bit of a neighbouring drawing (a tail tip over the cell line) is ignored.
 */
function bbox(img, rx, ry, rw, rh, gapShare = 0.02) {
  const colCount = new Array(rw).fill(0);
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx; x < rx + rw; x++) if (img.data[(y * img.w + x) * 4 + 3] > 24) colCount[x - rx]++;
  let best = null;
  let start = -1;
  for (let x = 0; x <= rw; x++) {
    const on = x < rw && colCount[x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      // Bridge small gaps (motion lines, a chain link): a run continues across gaps under 2% of the cell.
      let gapEnd = x;
      while (gapEnd < rw && colCount[gapEnd] === 0 && gapEnd - x < rw * gapShare) gapEnd++;
      if (gapEnd < rw && colCount[gapEnd] > 0 && gapEnd - x < rw * gapShare) {
        x = gapEnd - 1;
        continue;
      }
      if (!best || x - start > best[1] - best[0]) best = [start, x - 1];
      start = -1;
    }
  }
  if (!best) return null;
  let y0 = Infinity, y1 = -1;
  for (let y = ry; y < ry + rh; y++)
    for (let x = rx + best[0]; x <= rx + best[1]; x++)
      if (img.data[(y * img.w + x) * 4 + 3] > 24) {
        if (y - ry < y0) y0 = y - ry;
        if (y - ry > y1) y1 = y - ry;
      }
  return { x0: best[0], y0, x1: best[1], y1 };
}

/** Grows a box to the output aspect ratio (centred horizontally, anchored to the bottom) plus a margin. */
function fit(b, [ow, oh]) {
  const margin = 0.04;
  let w = (b.x1 - b.x0 + 1) * (1 + 2 * margin);
  let h = (b.y1 - b.y0 + 1) * (1 + 2 * margin);
  if (w / h > ow / oh) h = w * (oh / ow);
  else w = h * (ow / oh);
  const cx = (b.x0 + b.x1) / 2;
  const bottom = b.y1 + (b.y1 - b.y0 + 1) * margin;
  return { left: Math.round(cx - w / 2), top: Math.round(bottom - h), width: Math.round(w), height: Math.round(h) };
}

const PAD = 2000;
/** One cell of the sheet on its own, padded with transparency, so a crop never picks up a neighbour. */
async function cellImage(file, cell, cw, ch) {
  const only = await sharp(resolve(SHEETS, file)).ensureAlpha().extract({ left: cell.x, top: cell.y, width: cw, height: ch }).png().toBuffer();
  return sharp(only).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function cut(file, cell, cw, ch, box, [ow, oh], out) {
  await sharp(await cellImage(file, cell, cw, ch))
    .extract({ left: box.left + PAD, top: box.top + PAD, width: box.width, height: box.height })
    .resize(ow, oh, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: false })
    .toFile(resolve(ART, `${out}.png`));
}

for (const g of GROUPS) {
  const img = await load(g.sheet);
  const cw = Math.floor(img.w / g.cols);
  const ch = Math.floor(img.h / g.rows);
  const cells = (g.cells ?? g.slots.map((_, i) => i)).map((i) => {
    const row = Math.floor(i / g.cols);
    const col = i % g.cols;
    const edges = g.colEdges?.[row];
    return edges ? { x: edges[col], y: row * ch, w: edges[col + 1] - edges[col] } : { x: col * cw, y: row * ch, w: cw };
  });
  const boxes = cells.map((c) => bbox(img, c.x, c.y, c.w, ch, g.gap));
  const union = boxes.reduce((u, b) => (b ? { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) } : u), {
    x0: Infinity, y0: Infinity, x1: -1, y1: -1,
  });
  for (let i = 0; i < g.slots.length; i++) {
    const own = boxes[i];
    if (!own) {
      console.log(`skip ${g.slots[i]}: empty cell`);
      continue;
    }
    let box;
    if (g.mode === "anchor") {
      // Same scale for every frame (sized to the biggest one), each frame centred on itself and
      // standing on the bottom edge: frames line up when the game swaps between them.
      // Scale comes from the run cycle; an action frame bigger than that fits itself instead of shrinking every frame.
      const ref = (g.scaleFrom ?? g.slots.map((_, k) => k)).map((k) => boxes[k]).filter(Boolean);
      const bw = Math.max(...ref.map((b) => b.x1 - b.x0 + 1));
      const bh = Math.max(...ref.map((b) => b.y1 - b.y0 + 1));
      const ow = own.x1 - own.x0 + 1;
      const oh = own.y1 - own.y0 + 1;
      if (ow > bw * 1.05 || oh > bh * 1.05) box = fit(own, g.out);
      else {
        const cx = (own.x0 + own.x1) / 2;
        box = fit({ x0: cx - bw / 2, x1: cx + bw / 2, y0: own.y1 - bh, y1: own.y1 }, g.out);
      }
    } else {
      box = fit(g.mode === "own" ? own : union, g.out);
    }
    await cut(g.sheet, cells[i], cells[i].w, ch, box, g.out, g.slots[i]);
    console.log(`${g.slots[i]}.png  ${g.out.join("x")}`);
  }
}

// ---------------------------------------------------------------- backgrounds (public/bg)

// Full-scene backgrounds: trim a few pixels off the top-right corner (the generator's mark), save as JPEG.
for (const [file, out, trim] of [
  ["catRoom.png", "room-bg.jpg", { top: 28, right: 44 }],
  ["landingHero.png", "hero-bg.jpg", { top: 28, right: 44 }],
  ["prowlSkyline.png", "alley-bg.jpg", { top: 0, right: 0 }],
]) {
  const meta = await sharp(resolve(BG, file)).metadata();
  // Crop the corner away while keeping the aspect ratio (crop the same share from both axes).
  const k = Math.max(trim.top / meta.height, trim.right / meta.width);
  const w = Math.round(meta.width * (1 - k));
  const h = Math.round(meta.height * (1 - k));
  await sharp(resolve(BG, file))
    .extract({ left: 0, top: meta.height - h, width: w, height: h })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(resolve(ART, out));
  console.log(`${out}  ${w}x${h}`);
}

// The logo: drop the dark-brown glow painted around it (so it sits on any background), then trim.
// The letters use neutral black outlines, purples, pinks and a bright orange rim; the glow is the only
// warm *dark* colour, so pixels that are warm (red well above blue) and dark become transparent.
{
  const { data, info } = await sharp(resolve(BG, "logo.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const warm = r - b;
    const bright = Math.max(r, g, b);
    if (warm > 18 && bright < 175) {
      // Fade out: the darker and warmer, the more transparent (keeps the orange rim's soft edge).
      const keep = Math.max(0, Math.min(1, (bright - 120) / 55));
      data[i + 3] = Math.round(data[i + 3] * keep);
    }
  }
  await sharp(data, { raw: info }).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toFile(resolve(ART, "logo.png"));
  console.log("logo.png (glow removed)");
}

// The rooftop, as three pieces so a roof of any length gets proper ends: left cap, a repeating
// middle, right cap. Cut from the top of the roof cap down, so the top edge is the walkable surface.
{
  const roof = await load("../bg/rooftopPlatform.png");
  const mid = Math.floor(roof.w / 2);
  let top = 0;
  while (top < roof.h && roof.data[(top * roof.w + mid) * 4 + 3] < 128) top++;
  const b = bbox(roof, 0, 0, roof.w, roof.h);
  const height = b.y1 - top + 1;
  const cuts = [
    ["rooftop-left", b.x0, Math.round(roof.w * 0.32)],
    ["rooftop-mid", Math.round(roof.w * 0.32), Math.round(roof.w * 0.695)],
    ["rooftop-right", Math.round(roof.w * 0.695), b.x1 + 1],
  ];
  for (const [name, x0, x1] of cuts) {
    await sharp(resolve(SHEETS, "../bg/rooftopPlatform.png"))
      .extract({ left: x0, top, width: x1 - x0, height })
      .png({ compressionLevel: 9 })
      .toFile(resolve(ART, `${name}.png`));
    console.log(`${name}.png  ${x1 - x0}x${height}`);
  }
}
