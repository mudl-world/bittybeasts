// An RPG dialog box: a name tab on top, a framed portrait, the line, and (if it can be dismissed) a close button.
import type { ArtSlot } from "@/lib/ui/art";
import Art from "./Art";

/** Where the frame's bottom edge falls across the portrait: the art is sized so its floor sits here. */
const MASK = "linear-gradient(to bottom, #000 0 62%, rgb(0 0 0 / 0) 65%)";

export default function Dialog({
  name,
  portrait,
  children,
  footer,
  onClose,
  className = "",
}: {
  name: string;
  portrait: ArtSlot;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={`dialog ${className}`}>
      <span className="dialog-name">{name}</span>
      <div className="dialog-portrait">
        {/* The whole character, standing on the frame and breaking out of the top of it.
            Art sets its own width/aspect-ratio inline, so the pop-out sizing is passed here as
            inline style (Art spreads `style` last) rather than left to .dialog-portrait img. */}
        <Art
          slot={portrait}
          alt=""
          className="dialog-pop"
          style={{
            width: "150%",
            height: "auto",
            aspectRatio: "auto",
            // Cuts the art off at the tile's floor so only the head and shoulders escape the frame.
            // Inline because Tailwind v4 claims `mask-image` and drops the same rule in globals.css.
            WebkitMaskImage: MASK,
            maskImage: MASK,
          }}
        />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-2 ${onClose ? "pr-8" : "pr-1"} text-[1.05rem] leading-snug sm:text-lg`}>
        {children}
        {footer}
      </div>
      {onClose && (
        <button onClick={onClose} className="absolute right-2 top-2 transition hover:scale-110" aria-label="Close" title="Close">
          <Art slot="ui-close" alt="" size={30} />
        </button>
      )}
    </div>
  );
}

/** Renders "*purrs*"-style actions as amber stage directions instead of raw asterisks. */
export function Spoken({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span key={i} className="text-[#ffc93c]">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
