"use client";
// Shows a price; hover (desktop) or tap (phone) reveals the merchant's reasoning verbatim.
import { useEffect, useId, useRef, useState } from "react";

type Props = { price: React.ReactNode; reasoning: string | undefined; className?: string };

export default function PriceTooltip({ price, reasoning, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={reasoning ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md px-1 font-display font-semibold text-lantern underline decoration-dotted decoration-lantern/50 underline-offset-4"
      >
        {price}
        <span aria-hidden className="text-[0.7em] text-mist">ⓘ</span>
      </button>
      {open && reasoning && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl bg-paper px-3 py-2 text-left text-xs leading-snug text-night-900 shadow-xl animate-rise"
        >
          {reasoning}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-paper" />
        </span>
      )}
    </span>
  );
}
