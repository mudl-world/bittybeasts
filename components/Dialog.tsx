// An RPG dialog box: a name tab on top, a framed portrait, the line, and (if it can be dismissed) a close button.
import type { ArtSlot } from "@/lib/ui/art";
import Art from "./Art";

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
        {/* zoomed to the face: portraits are full-body art, so show the head and shoulders */}
        <Art slot={portrait} alt="" className="max-w-none" style={{ width: "150%", marginTop: "2%" }} />
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
