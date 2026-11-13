// The six scenes of the story film, built from the artist's own art (public/art): each scene is one of
// the game's backgrounds with slow camera moves, light effects and the characters animated on top.
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS as C, DISPLAY_FONT, WIDTH } from "./script";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const art = (file: string) => staticFile(`art/${file}`);

/** A full-frame background image with a slow camera move. */
function Backdrop({ file, frames, zoom = [1.08, 1], pan = [0, 0], panY = [0, 0], filter }: { file: string; frames: number; zoom?: [number, number]; pan?: [number, number]; panY?: [number, number]; filter?: string }) {
  const f = useCurrentFrame();
  const t = { ...clamp, easing: Easing.inOut(Easing.quad) };
  const s = interpolate(f, [0, frames], zoom, t);
  const x = interpolate(f, [0, frames], pan, t);
  const y = interpolate(f, [0, frames], panY, t);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={art(file)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${x}px, ${y}px) scale(${s})`, filter }} />
    </AbsoluteFill>
  );
}

/** Fades the scene in and out. */
function Shot({ frames, children }: { frames: number; children: React.ReactNode }) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 15, frames - 15, frames], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity, background: C.night950, overflow: "hidden" }}>{children}</AbsoluteFill>;
}

/** A drawn sprite (cat, merchant, link...) placed in the 1920x1080 frame. */
function Sprite({ file, style }: { file: string; style: React.CSSProperties }) {
  return <Img src={art(file)} style={{ position: "absolute", objectFit: "contain", ...style }} />;
}

/** Glowing embers drifting up from a point. */
function Embers({ x, y, spread = 260, count = 40, rise = 620 }: { x: number; y: number; spread?: number; count?: number; rise?: number }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        {Array.from({ length: count }, (_, i) => {
          const speed = 1 + random(`s${i}`) * 2;
          const life = 240;
          const t = ((f * speed + random(`o${i}`) * life) % life) / life;
          const px = x + (random(`x${i}`) - 0.5) * spread + Math.sin(f / 14 + i) * 30 * t;
          return <circle key={i} cx={px} cy={y - t * rise} r={2.5 + random(`r${i}`) * 3.5} fill={i % 3 ? C.lantern : C.ember} opacity={(1 - t) * 0.95} />;
        })}
      </svg>
    </AbsoluteFill>
  );
}

/** Night darkening over a scene: 0 = as painted, 1 = deep night. */
function Dim({ amount }: { amount: number }) {
  return <AbsoluteFill style={{ background: C.night950, opacity: amount }} />;
}

/** The pixel-RPG caption box, matching the game's dialog boxes. */
export function Caption({ title, text, frames }: { title: string; text: string; frames: number }) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [20, 40, frames - 25, frames - 10], [0, 1, 1, 0], clamp);
  const y = interpolate(f, [20, 40], [20, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56, opacity }}>
      <div
        style={{
          position: "relative",
          transform: `translateY(${y}px)`,
          maxWidth: 1320,
          padding: title ? "34px 44px 24px" : "24px 44px",
          borderRadius: 14,
          background: "rgba(22,15,56,0.93)",
          border: "5px solid #1a0b2e",
          boxShadow: "inset 0 0 0 4px #b06b33, inset 0 0 0 7px rgba(255,201,60,0.55), 0 10px 0 #1a0b2e, 0 30px 60px rgba(0,0,0,0.5)",
          fontFamily: DISPLAY_FONT,
          textAlign: "center",
        }}
      >
        {title && (
          <div
            style={{
              position: "absolute",
              top: -26,
              left: 40,
              padding: "6px 22px",
              background: "#ffc93c",
              color: "#1a0b2e",
              border: "4px solid #1a0b2e",
              borderRadius: 8,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
        )}
        <div style={{ color: C.paper, fontSize: 38, lineHeight: 1.3 }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
}

// ---- 1. The city sleeps: the skyline, lights going out ----------------------------------------

export function CityScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  return (
    <Shot frames={frames}>
      <Backdrop file="alley-bg.jpg" frames={frames} zoom={[1.18, 1.05]} pan={[0, -160]} />
      <Dim amount={interpolate(f, [20, frames - 30], [0, 0.45], clamp)} />
    </Shot>
  );
}

// ---- 2. A spark in the dark: embers down the back alley, a grey stray takes colour -------------

export function KilnScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - 30, fps, config: { damping: 18 } });
  const glaze = interpolate(f, [110, 180], [1, 0], clamp);
  const flash = interpolate(f, [100, 112, 140], [0, 0.55, 0], clamp);
  return (
    <Shot frames={frames}>
      <Backdrop file="backalley-scene.jpg" frames={frames} zoom={[1.12, 1.02]} />
      <Dim amount={0.25} />
      <Embers x={WIDTH / 2} y={900} spread={500} count={46} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 62%, rgba(255,181,71,${flash}), transparent 45%)` }} />
      <Sprite
        file="cat-sleepy.png"
        style={{ width: 240, left: WIDTH / 2 - 120, top: 420 + (1 - rise) * 80, opacity: rise * glaze, filter: "grayscale(1) brightness(0.85)" }}
      />
      <Sprite
        file="cat-surprised.png"
        style={{ width: 240, left: WIDTH / 2 - 120, top: 420 + (1 - rise) * 80, opacity: rise * (1 - glaze), filter: `drop-shadow(0 0 ${40 * (1 - glaze)}px ${C.lantern})` }}
      />
    </Shot>
  );
}

// ---- 3. Eyes open: the attic, the cat on the rug, nine links lighting -------------------------

export function WakeScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const face = f < 70 ? "cat-sleepy.png" : f < 110 ? "cat-surprised.png" : "cat-happy.png";
  const pop = interpolate(f, [70, 76, 84], [1, 1.06, 1], clamp);
  const lit = interpolate(f, [120, 240], [0, 9], clamp);
  return (
    <Shot frames={frames}>
      <Backdrop file="room-bg.jpg" frames={frames} zoom={[1.04, 1.12]} panY={[0, -40]} />
      <Sprite file={face} style={{ width: 300, left: WIDTH / 2 - 150, top: 330, transform: `scale(${pop})` }} />
      <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
        {Array.from({ length: 9 }, (_, i) => {
          const on = Math.max(0, Math.min(1, lit - i));
          return (
            <div key={i} style={{ position: "relative", width: 74, height: 74, transform: `rotate(${i % 2 ? 90 : 0}deg) scale(${1 + 0.25 * Math.sin(on * Math.PI)})` }}>
              <Img src={art("ui-link-dark.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              <Img src={art("ui-link-lit.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: on, filter: `drop-shadow(0 0 ${18 * on}px ${C.lantern})` }} />
            </div>
          );
        })}
      </div>
    </Shot>
  );
}

// ---- 4. The Great Yarn ------------------------------------------------------------------------

export function YarnScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const glow = 0.25 + 0.15 * Math.sin(f / 12);
  return (
    <Shot frames={frames}>
      <Backdrop file="yarn-scene.jpg" frames={frames} zoom={[1.2, 1.02]} panY={[60, 0]} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 30%, rgba(232,115,90,${glow}), transparent 40%)` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 120,
          textAlign: "center",
          fontFamily: DISPLAY_FONT,
          fontSize: 92,
          fontWeight: 700,
          color: "#ffc93c",
          letterSpacing: 8,
          textShadow: "6px 6px 0 #1a0b2e, 0 0 40px rgba(255,201,60,0.5)",
          opacity: interpolate(f, [120, 150, frames - 30, frames - 15], [0, 1, 1, 0], clamp),
        }}
      >
        $YARN
      </div>
    </Shot>
  );
}

// ---- 5. Lantern Lane: the merchants step out ----------------------------------------------------

const MERCHANTS = ["merchant-tom.png", "merchant-miso.png", "merchant-bandit.png", "merchant-clove.png"];

export function LaneScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eyes = interpolate(f, [190, 215], [0, 1], clamp);
  return (
    <Shot frames={frames}>
      <Backdrop file="hero-bg.jpg" frames={frames} zoom={[1.1, 1]} pan={[60, 0]} />
      {MERCHANTS.map((file, i) => {
        const up = spring({ frame: f - 25 - i * 22, fps, config: { damping: 13 } });
        return (
          <Sprite
            key={file}
            file={file}
            style={{ width: 210, left: 330 + i * 330, top: 470 + (1 - up) * 180, opacity: up, filter: "drop-shadow(0 18px 18px rgba(0,0,0,0.55))" }}
          />
        );
      })}
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: eyes }}>
        {[
          [90, 760],
          [1830, 720],
        ].map(([x, y], k) => {
          const open = (f + k * 30) % 90 < 84 ? 1 : 0.1;
          return (
            <g key={k}>
              {[-18, 18].map((dx) => (
                <g key={dx}>
                  <ellipse cx={x + dx} cy={y} rx={16} ry={16 * open} fill="#ff4d4d" opacity={0.3} />
                  <ellipse cx={x + dx} cy={y} rx={9} ry={9 * open} fill="#ffd36b" />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </Shot>
  );
}

// ---- 6. Title -------------------------------------------------------------------------------

export function TitleScene({ frames }: { frames: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 5, fps, config: { damping: 12 } });
  return (
    <Shot frames={frames}>
      <Backdrop file="hero-bg.jpg" frames={frames} zoom={[1.02, 1.08]} filter="blur(6px) brightness(0.6)" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img src={art("logo.png")} style={{ width: 1100, transform: `scale(${0.8 + 0.2 * pop})`, opacity: pop, marginTop: -120, filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.7))" }} />
      </AbsoluteFill>
    </Shot>
  );
}
