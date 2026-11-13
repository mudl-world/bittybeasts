# Art slots

Every graphic in Bitty Beasts is a **slot**. The files in this folder are neutral placeholders
(dashed rounded rectangles with a label). Replace them with the real art; nothing else needs to change.

## Delivered

The artist's sprite sheets live in `public/sheets/`; `node scripts/slice-sheets.mjs` cuts them into the PNG slots below
(cat expressions incl. `cat-talk`/`cat-eat`, prowl frames incl. `cat-jump`, merchants, the rat, marks). Re-run it after
updating a sheet. Clothes sit on the cat at `OUTFIT_ANCHORS` in `lib/ui/art.ts`.

The same script also takes `public/bg/`: the cat room (`room-bg.jpg`), the landing hero (`hero-bg.jpg`), the prowl
skyline (`alley-bg.jpg`, tiled mirrored), the rooftop (cut into `rooftop-left/mid/right.png`), the item icons
(`item-*.png`, incl. `item-yarn`), the interface icons (`ui-*.png`: room actions, tail links, thought, verified) and
the logo (`logo.png`).

## How to swap art

1. Export the drawing at the size below (or any size with the **same aspect ratio** — it is scaled).
2. Drop it into `public/art/` with the **exact filename** in the table, overwriting the placeholder.
3. If your file is PNG or WebP instead of SVG, change that slot's `file` in `lib/ui/art.ts`
   (one line per slot). `components/Art.tsx` and the Prowl canvas both read from that registry.

Transparent backgrounds please, for everything except `alley-bg`.

## Style notes

Series 1: Alley Cats — black clay cats with big eyes and a chained tail. The tail is drawn by the UI
(9 chain links = life bar), so **portraits should leave the tail short or hidden** at the bottom-right.
Expressions: neutral, happy, curious, surprised, angry, sleepy.
Prowl sprites face **right**; the rat runs **left**. Marks (scar, bent ear, patch) are small badges
shown next to the portrait.

## Slots

| Slot | Filename | Size (px) | Owner | What it shows |
| --- | --- | --- | --- | --- |
| `keychain-hero` | `keychain-hero.svg` | 768×768 | artist | The clay Alley Cat keychain on its ring, chained tail hanging — landing hero |
| `cat-neutral` | `cat-neutral.svg` | 512×512 | artist | Beast portrait, neutral face |
| `cat-happy` | `cat-happy.svg` | 512×512 | artist | Beast portrait, happy (after a boop / good haul) |
| `cat-curious` | `cat-curious.svg` | 512×512 | artist | Beast portrait, curious (wake-up step 3, market browsing) |
| `cat-surprised` | `cat-surprised.svg` | 512×512 | artist | Beast portrait, surprised (wake-up step 2) |
| `cat-angry` | `cat-angry.svg` | 512×512 | artist | Beast portrait, angry (lost a life / rat thief) |
| `cat-sleepy` | `cat-sleepy.svg` | 512×512 | artist | Beast portrait, sleepy (before wake, resting at 0 lives) |
| `cat-run-1` | `cat-run-1.svg` | 256×192 | artist | Prowl sprite frame 1 of 4, side view facing right |
| `cat-run-2` | `cat-run-2.svg` | 256×192 | artist | Prowl sprite frame 2 of 4 |
| `cat-run-3` | `cat-run-3.svg` | 256×192 | artist | Prowl sprite frame 3 of 4 |
| `cat-run-4` | `cat-run-4.svg` | 256×192 | artist | Prowl sprite frame 4 of 4 |
| `cat-fall` | `cat-fall.svg` | 256×192 | artist | Prowl: tumbling off a roof |
| `cat-whip` | `cat-whip.svg` | 256×192 | artist | Prowl: Chain Whip — tail lashing forward |
| `cat-bind` | `cat-bind.svg` | 256×192 | artist | Prowl: Chain Bind — tail wrapping a rat |
| `rat-thief` | `rat-thief.svg` | 192×128 | artist | Prowl: rat thief with a sack, running left |
| `merchant-tom` | `merchant-tom.svg` | 384×384 | artist | Lantern Lane: Tom the fishmonger cat |
| `merchant-miso` | `merchant-miso.svg` | 384×384 | artist | Lantern Lane: Miso the trinket cat |
| `merchant-bandit` | `merchant-bandit.svg` | 384×384 | artist | Lantern Lane: Bandit the fence |
| `merchant-clove` | `merchant-clove.svg` | 384×384 | artist | Lantern Lane: Clove the herbalist |
| `mark-scar` | `mark-scar.svg` | 128×128 | artist | Mark badge: a scar left by a lost life |
| `mark-bent-ear` | `mark-bent-ear.svg` | 128×128 | artist | Mark badge: a bent ear |
| `mark-patch` | `mark-patch.svg` | 128×128 | artist | Mark badge: an eye patch / stitched patch |
| `rooftop` | `rooftop.svg` | 256×128 | artist (world) | Prowl: tileable rooftop block (top edge is the walkable surface) |
| `alley-bg` | `alley-bg.svg` | 1600×600 | artist (world) | Background: night alley skyline, tileable horizontally |
| `lantern-lit` | `lantern-lit.svg` | 64×96 | artist (world) | Paper lantern, glowing |
| `lantern-unlit` | `lantern-unlit.svg` | 64×96 | artist (world) | Paper lantern, dark |
| `item-fish` | `item-fish.svg` | 96×96 | artist (world) | Item icon: fish |
| `item-button` | `item-button.svg` | 96×96 | artist (world) | Item icon: shiny button |
| `item-bell` | `item-bell.svg` | 96×96 | artist (world) | Item icon: bell (rare) |
| `item-moonstone` | `item-moonstone.svg` | 96×96 | artist (world) | Item icon: moonstone (rare) |
| `item-charm` | `item-charm.svg` | 96×96 | artist (world) | Item icon: lucky charm (saves a haul once) |
| `item-catnip` | `item-catnip.svg` | 96×96 | artist (world) | Item icon: catnip |
| `item-lantern` | `item-lantern.svg` | 96×96 | artist (world) | Item icon: spare lantern |

The UI draws its own chrome (chain links, lantern row icons, buttons, progress bars, night sky);
`lantern-lit` / `lantern-unlit` are only used for the big stall lanterns.

## The story film

The cold open (`/story`, and `remotion/` for the MP4) draws the whole world in code: the city, the kiln, the
Great Yarn, the Lane, lanterns and rat eyes. The only art it uses is the cat slots above:
`cat-neutral` (the clay cat in the kiln), `cat-sleepy` → `cat-surprised` → `cat-happy` (waking up on the keyring),
`cat-run-1`/`cat-run-2` (tugging the yarn on the rooftops) and the four `merchant-*` portraits. Drop in those files
and the film updates with them.
