// Cuts the artist's UI art (public/bg) into game slots (public/art) and writes the 9-slice CSS for the
// UI kit (app/ui-kit.css).   node scripts/slice-ui.mjs
//
// - Sheets with real transparency are split by their empty gaps (rows, then columns within a row).
// - The mission posters and run results came with a checkerboard painted in: we flood-fill it away from
//   the image edges (the art's thick outlines stop the fill), then split them the same way.
// - The UI kit is cut at fixed boxes, each trimmed to what's drawn, and measured for border-image slices.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));
const ROOT = resolve(import.meta.dirname, "..");
const BG = (f) => resolve(ROOT, "public/bg", f);
const ART = (f) => resolve(ROOT, "public/art", f);

async function rgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Removes a painted checkerboard (light, grey, unsaturated) connected to the image border. */
function dechecker(img) {
  const { data, w, h } = img;
  const isChecker = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) < 10 && Math.min(r, g, b) > 190;
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isChecker(p * 4)) continue;
    data[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // Soften the 1px fringe left next to removed pixels.
  for (let p = 0; p < w * h; p++) {
    if (data[p * 4 + 3] === 0) continue;
    const x = p % w, y = (p / w) | 0;
    const near = [p - 1, p + 1, p - w, p + w].some((q) => q >= 0 && q < w * h && Math.abs((q % w) - x) <= 1 && Math.abs(((q / w) | 0) - y) <= 1 && data[q * 4 + 3] === 0);
    if (near && isChecker(p * 4)) data[p * 4 + 3] = 0;
  }
  // Despeckle: clear opaque pixels with few opaque neighbours (thin seams and stray dots in the gaps).
  const keep = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (data[((y + dy) * w + x + dx) * 4 + 3] > 0) n++;
      keep[y * w + x] = n >= 10 ? 1 : 0;
    }
  for (let p = 0; p < w * h; p++) if (!keep[p]) data[p * 4 + 3] = 0;
  return img;
}

/** Splits content into boxes: bands of non-empty rows, then bands of non-empty columns inside each. */
function segment(img, { minGap = 12, minSize = 40, alpha = 40 } = {}) {
  const { data, w, h } = img;
  const on = (x, y) => data[(y * w + x) * 4 + 3] > alpha;
  const bands = (n, test) => {
    const out = [];
    let start = -1, gap = 0;
    for (let i = 0; i <= n; i++) {
      const hit = i < n && test(i);
      if (hit) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap >= minGap || i === n) {
          const end = i - gap;
          if (end - start + 1 >= minSize) out.push([start, end]);
          start = -1;
          gap = 0;
        }
      }
    }
    return out;
  };
  const rows = bands(h, (y) => { for (let x = 0; x < w; x++) if (on(x, y)) return true; return false; });
  const boxes = [];
  for (const [y0, y1] of rows) {
    const cols = bands(w, (x) => { for (let y = y0; y <= y1; y++) if (on(x, y)) return true; return false; });
    for (const [x0, x1] of cols) {
      let t = y1, b = y0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) { if (y < t) t = y; if (y > b) b = y; }
      boxes.push({ left: x0, top: t, width: x1 - x0 + 1, height: b - t + 1 });
    }
  }
  return boxes;
}

async function save(img, box, out, pad = 4) {
  const buf = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({
      left: Math.max(0, box.left - pad),
      top: Math.max(0, box.top - pad),
      width: Math.min(img.w - Math.max(0, box.left - pad), box.width + pad * 2),
      height: Math.min(img.h - Math.max(0, box.top - pad), box.height + pad * 2),
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(buf).toFile(ART(out));
  const m = await sharp(buf).metadata();
  console.log(`${out}  ${m.width}x${m.height}`);
  return m;
}

/** Splits into equal columns, each trimmed to what's drawn (for sheets with seams in their gaps). */
function columns(img, n, alpha = 40) {
  const out = [];
  const cw = Math.floor(img.w / n);
  for (let c = 0; c < n; c++) {
    let l = img.w, t = img.h, r = 0, b = 0;
    for (let y = 0; y < img.h; y++)
      for (let x = c * cw; x < (c + 1) * cw; x++) {
        if (img.data[(y * img.w + x) * 4 + 3] <= alpha) continue;
        // ignore specks: require a solid neighbour run
        if (img.data[(y * img.w + Math.min(img.w - 1, x + 3)) * 4 + 3] <= alpha) continue;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    out.push({ left: l, top: t, width: r - l + 1, height: b - t + 1 });
  }
  return out;
}

/** Even grid cells, each trimmed to its widest connected run of solid columns (drops neighbours' edges). */
function grid(img, cols, rows, alpha) {
  const out = [];
  const cw = Math.floor(img.w / cols), ch = Math.floor(img.h / rows);
  const on = (x, y) => img.data[(y * img.w + x) * 4 + 3] > alpha;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = c * cw, y0 = r * ch;
      const count = [];
      for (let x = x0; x < x0 + cw; x++) {
        let n = 0;
        for (let y = y0; y < y0 + ch; y++) if (on(x, y)) n++;
        count.push(n);
      }
      // widest run, bridging gaps up to 8px
      let best = [0, -1], start = -1, lastHit = -1;
      for (let i = 0; i <= count.length; i++) {
        const hit = i < count.length && count[i] > 0;
        if (hit) {
          if (start < 0 || i - lastHit > 8) start = i;
          lastHit = i;
          if (lastHit - start > best[1] - best[0]) best = [start, lastHit];
        }
      }
      let t = img.h, b = 0;
      for (let y = y0; y < y0 + ch; y++) for (let x = x0 + best[0]; x <= x0 + best[1]; x++) if (on(x, y)) { if (y < t) t = y; if (y > b) b = y; }
      out.push({ left: x0 + best[0], top: t, width: best[1] - best[0] + 1, height: b - t + 1 });
    }
  return out;
}

async function splitSheet(file, names, opts = {}) {
  const img = await rgba(BG(file));
  if (opts.checker) dechecker(img);
  const boxes = opts.grid ? grid(img, opts.grid[0], opts.grid[1], opts.alpha ?? 200) : opts.even ? columns(img, names.length) : segment(img, opts);
  if (boxes.length !== names.length) throw new Error(`${file}: found ${boxes.length} pieces, expected ${names.length}`);
  const sizes = {};
  for (let i = 0; i < names.length; i++) sizes[names[i]] = await save(img, boxes[i], `${names[i]}.png`);
  return sizes;
}

// ---------------------------------------------------------------- sheets
await splitSheet("missionPosters.png", ["mission-safe", "mission-daring"], { checker: true, even: true });
await splitSheet("runResults.png", ["result-haul", "result-fall", "result-cashout"], { checker: true, even: true });
await splitSheet("statsAndControlIcons.png", ["skill-speed", "skill-reach", "skill-grip", "skill-luck", "ctl-dash", "ctl-whip", "ctl-bind", "ctl-cashout"], { grid: [4, 2] });
await splitSheet(
  "smallStatusIcons.png",
  ["st-clock", "st-mint", "st-burn", "st-slot", "st-open", "st-closed", "st-receipt", "st-legend", "st-plus", "st-minus", "st-sell", "st-buy"],
  { grid: [4, 3] },
);

// ---------------------------------------------------------------- the UI kit
const kit = await rgba(BG("uiKit.png"));
const KIT = {
  "ui-panel-lg": [38, 55, 545, 335],
  "ui-panel": [625, 82, 300, 292],
  "ui-dialog": [965, 72, 540, 292],
  "ui-btn-gold": [32, 448, 296, 125],
  "ui-btn-gold-down": [345, 460, 225, 100],
  "ui-btn-purple": [588, 450, 280, 120],
  "ui-btn-purple-down": [882, 462, 182, 98],
  "ui-btn-coral": [1078, 450, 270, 120],
  "ui-btn-coral-down": [1358, 462, 155, 98],
  "ui-sq-purple": [28, 652, 165, 158],
  "ui-sq-purple-down": [212, 652, 162, 158],
  "ui-bar": [405, 630, 462, 70],
  "ui-bar-gold": [405, 715, 462, 68],
  "ui-bar-green": [405, 798, 462, 68],
  "ui-ribbon": [925, 605, 585, 170],
  "ui-badge": [998, 793, 170, 165],
  "ui-tag": [1222, 798, 212, 145],
};
const trimBox = (img, [x, y, w, h]) => {
  let l = x + w, t = y + h, r = x, b = y;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (img.data[(yy * img.w + xx) * 4 + 3] > 200) {
        if (xx < l) l = xx;
        if (xx > r) r = xx;
        if (yy < t) t = yy;
        if (yy > b) b = yy;
      }
  return { left: l, top: t, width: r - l + 1, height: b - t + 1 };
};
const kitSize = {};
for (const [name, box] of Object.entries(KIT)) kitSize[name] = await save(kit, trimBox(kit, box), `${name}.png`, 0);

// ---------------------------------------------------------------- 9-slice CSS
// Slices are proportions of each piece: frames keep their corners (rivets, wood); pill buttons keep
// their round ends; the middle stretches. Rendered border widths are set per component in globals.css.
const px = (name, f) => Math.round(kitSize[name].height * f);
const css = `/* Generated by scripts/slice-ui.mjs from public/bg/uiKit.png. Do not edit by hand. */
:root {
  --kit-panel: url("/art/ui-panel.png");
  --kit-panel-slice: ${px("ui-panel", 0.3)};
  --kit-panel-lg: url("/art/ui-panel-lg.png");
  --kit-panel-lg-slice: ${px("ui-panel-lg", 0.26)};
  --kit-btn-gold: url("/art/ui-btn-gold.png");
  --kit-btn-gold-down: url("/art/ui-btn-gold-down.png");
  --kit-btn-purple: url("/art/ui-btn-purple.png");
  --kit-btn-purple-down: url("/art/ui-btn-purple-down.png");
  --kit-btn-coral: url("/art/ui-btn-coral.png");
  --kit-btn-coral-down: url("/art/ui-btn-coral-down.png");
  --kit-btn-slice: ${px("ui-btn-gold", 0.45)};
  --kit-sq: url("/art/ui-sq-purple.png");
  --kit-sq-down: url("/art/ui-sq-purple-down.png");
  --kit-sq-slice: ${px("ui-sq-purple", 0.32)};
  --kit-bar: url("/art/ui-bar.png");
  --kit-bar-gold: url("/art/ui-bar-gold.png");
  --kit-bar-green: url("/art/ui-bar-green.png");
  --kit-bar-slice: ${px("ui-bar", 0.48)};
}
`;
writeFileSync(resolve(ROOT, "app/ui-kit.css"), css);
console.log("app/ui-kit.css");

// ---------------------------------------------------------------- scenes
for (const [file, out] of [
  ["stallScene.png", "stall-scene.jpg"],
  ["diaryScene.png", "diary-scene.jpg"],
  ["ledgerScene.png", "ledger-scene.jpg"],
  ["yarnScene.png", "yarn-scene.jpg"],
  ["backAlleyScene.png", "backalley-scene.jpg"],
  ["storyScene.png", "story-scene.jpg"],
]) {
  const m = await sharp(BG(file)).metadata();
  // Trim a sliver off the top-right (the generator's mark), keeping the aspect ratio.
  const k = 44 / m.width;
  const w = Math.round(m.width * (1 - k)), h = Math.round(m.height * (1 - k));
  await sharp(BG(file)).extract({ left: 0, top: m.height - h, width: w, height: h }).jpeg({ quality: 84, mozjpeg: true }).toFile(ART(out));
  console.log(`${out}  ${w}x${h}`);
}
