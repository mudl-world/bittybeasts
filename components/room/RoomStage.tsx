"use client";
// The cat's room: the artist's attic (room-bg) with the cat standing on the rug.
// The cat is the artist's portrait art slot; clothes are drawn over it at OUTFIT_ANCHORS.
import type { Cosmetic } from "@/lib/chain";
import { OUTFIT_ANCHORS, catSlot, type Expression } from "@/lib/ui/art";
import Art from "../Art";

/** The room art's aspect ratio (room-bg.jpg). */
export const ROOM_RATIO = 1622 / 913;

export type CatAnim = "idle" | "pet" | "eat" | "talk";

export default function RoomStage({
  expression,
  outfit,
  anim,
  bubble,
  bubbleBadge,
  hearts,
  onTapCat,
}: {
  expression: Expression;
  outfit: Cosmetic[];
  anim: CatAnim;
  bubble: string | null;
  bubbleBadge?: React.ReactNode;
  hearts: number;
  onTapCat: () => void;
}) {
  return (
    <div className="absolute inset-0">
      <Art slot="room-bg" alt="" className="absolute inset-0 h-full w-full select-none object-cover" />
      {/* the cat, standing on the rug, with its speech bubble anchored just above its head */}
      <div className="absolute bottom-[11%] left-1/2 -translate-x-1/2" style={{ width: "min(22%, 56vw)" }}>
        {bubble && (
          <div className="absolute bottom-[calc(100%+18px)] left-1/2 w-max max-w-[min(90vw,440px)] -translate-x-1/2 animate-pop">
            <div className="bubble text-center">
              {bubble}
              {bubbleBadge && <div className="mt-1.5 text-sm">{bubbleBadge}</div>}
            </div>
          </div>
        )}
        <button type="button" aria-label="Pet your cat" onClick={onTapCat} className="block w-full cursor-pointer focus:outline-none">
          <div key={`${anim}-${hearts}`} className={anim === "pet" ? "cat-wiggle" : anim === "eat" ? "cat-chomp" : "cat-breathe"}>
            <div className="relative">
              <Art slot={catSlot(expression)} className="w-full select-none" alt="Your cat" />
              {outfit.map((item) => {
                const a = OUTFIT_ANCHORS[item];
                return (
                  <Art
                    key={item}
                    slot={`item-${item}`}
                    alt=""
                    className="pointer-events-none absolute"
                    style={{ top: `${a.top}%`, left: `${a.left}%`, width: `${a.width}%`, transform: a.rotate ? `rotate(${a.rotate}deg)` : undefined }}
                  />
                );
              })}
            </div>
          </div>
          {/* hearts float up when petted */}
          {hearts > 0 &&
            [0, 1, 2].map((i) => (
              <span
                key={`${hearts}-${i}`}
                aria-hidden
                className="float-up pointer-events-none absolute text-3xl text-ember"
                style={{ left: `${30 + i * 20}%`, top: "10%", animationDelay: `${i * 0.15}s` }}
              >
                ♥
              </span>
            ))}
        </button>
      </div>
    </div>
  );
}
