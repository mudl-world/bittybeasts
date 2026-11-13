// Renders one art slot by name. All graphics go through here, so swapping art is a file drop
// into public/art/ (see public/art/README.md and lib/ui/art.ts).
import { ART, artSrc, type ArtSlot } from "@/lib/ui/art";

type Props = {
  slot: ArtSlot;
  className?: string;
  alt?: string;
  /** CSS width in px; height follows the slot's aspect ratio. Omit to size with className. */
  size?: number;
  style?: React.CSSProperties;
};

const fills = (c?: string) => !!c && /(^|\s)(h-full|object-cover)(\s|$)/.test(c);

export default function Art({ slot, className, alt, size, style }: Props) {
  const spec = ART[slot];
  return (
    // Plain <img>: art is local, may be SVG, and must keep its exact pixels for the artist's files.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={artSrc(slot)}
      alt={alt ?? spec.label}
      width={spec.w}
      height={spec.h}
      draggable={false}
      className={className}
      // Backgrounds sized by class (h-full / object-cover) keep their box; everything else keeps its
      // aspect ratio. alignSelf:"center" stops a flex/grid parent stretching the art on the cross axis
      // (align-items defaults to stretch, which beats height:auto and distorts it). "center" rather than
      // "start" so a column parent's items-center still centres the art horizontally; a parent that wants
      // a different cross-axis position sets it per item (e.g. self-start) and that wins over this.
      style={fills(className) ? style : { width: size ?? undefined, height: "auto", aspectRatio: `${spec.w} / ${spec.h}`, alignSelf: "center", flexShrink: 0, objectFit: "contain", ...style }}
    />
  );
}
