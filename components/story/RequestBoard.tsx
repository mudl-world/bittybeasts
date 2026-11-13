// Tonight's notice board: what each merchant wants, refuses, or needs, in their own words.
import type { MerchantRequest } from "@/lib/economy/requests";
import { MERCHANTS } from "@/lib/economy/pricing";
import { merchantSlot } from "@/lib/ui/art";
import Art from "../Art";
import { Pill } from "../ui";

export function RequestTag({ r }: { r: MerchantRequest }) {
  if (r.kind === "closed") return <Pill tone="ember">needs investors</Pill>;
  if (r.kind === "refuse") return <Pill tone="ember">not buying {r.item}</Pill>;
  if (r.kind === "help")
    return r.remaining === 0 ? <Pill tone="moss">done: {r.got} bound</Pill> : <Pill tone="lantern">Gnawers bound {r.got}/{r.wanted}</Pill>;
  if (!r.item || r.wanted === 0) return <Pill>no request</Pill>;
  return r.remaining === 0 ? (
    <Pill tone="moss">filled: {r.wanted} {r.item}</Pill>
  ) : (
    <Pill tone="lantern">
      wants {r.remaining} {r.item} · +25%
    </Pill>
  );
}

/** One merchant's request, as a quoted line. Used on the stall card. */
export function RequestLine({ r }: { r: MerchantRequest }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-lantern/30 bg-lantern/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-lantern">Tonight&apos;s request</span>
        <RequestTag r={r} />
      </div>
      <p className="text-xs italic text-paper/90">&ldquo;{r.text}&rdquo;</p>
    </div>
  );
}

export default function RequestBoard({ requests }: { requests: MerchantRequest[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {requests.map((r) => (
        <div key={r.merchant} className="flex gap-3 rounded-xl bg-white/5 p-3">
          <Art slot={merchantSlot(r.merchant)} size={48} className={`shrink-0 rounded-xl ${r.kind === "closed" ? "grayscale" : ""}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold">{MERCHANTS[r.merchant].name}</span>
              <RequestTag r={r} />
            </div>
            <p className="text-sm italic text-mist">&ldquo;{r.text}&rdquo;</p>
          </div>
        </div>
      ))}
    </div>
  );
}
