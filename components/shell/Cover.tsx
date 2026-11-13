// A full-screen scene: the art covers the whole viewport (like CSS background-size: cover), and children
// are positioned in percentages of the ART, so things placed on it (a cat on a rug) stay put on any screen.
export default function Cover({ ratio, children }: { ratio: number; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-night-950">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: `max(100vw, calc(100dvh * ${ratio}))`, aspectRatio: `${ratio}` }}
      >
        {children}
      </div>
    </div>
  );
}
