"use client";
import { CONFIG, getHistory, type HistoryEntry } from "@/lib/chain";
import { QUIET } from "@/lib/ui/errors";
import { formatDateTime, yarn } from "@/lib/ui/format";
import { useAsync } from "@/lib/ui/useAsync";
import { Empty, Loading } from "../ui";

export function entryIcon(kind: string): string {
  const k = kind.toLowerCase();
  if (/wake|born|register/.test(k)) return "✦";
  if (/boop/.test(k)) return "♥";
  if (/fall|life_lost|lost|mark/.test(k)) return "✖";
  if (/prowl|run/.test(k)) return "➶";
  if (/sell|sold|buy|bought|trade|market/.test(k)) return "⚖";
  if (/stall|rent/.test(k)) return "⌂";
  if (/revive/.test(k)) return "☀";
  if (/wander|adopt|transfer|owner/.test(k)) return "⇄";
  if (/legend/.test(k)) return "★";
  return "·";
}

/** Transaction hashes for a cat's diary lines, keyed `${at_ms}|${kind}` (matched on NearBlocks by the server). */
export function useDiaryTxs(tokenId: string, refreshKey = 0) {
  const r = useAsync(
    () =>
      fetch(`/api/txs/diary?token=${encodeURIComponent(tokenId)}`)
        .then((res) => res.json() as Promise<{ links?: Record<string, string> }>)
        .then((b) => b.links ?? {}),
    [tokenId, refreshKey],
  );
  return r.data;
}

export function DiaryList({ entries, filter, txs }: { entries: HistoryEntry[]; filter?: (e: HistoryEntry) => boolean; txs?: Record<string, string> }) {
  const list = [...(filter ? entries.filter(filter) : entries)].sort((a, b) => b.at_ms - a.at_ms);
  if (!list.length) return <p className="py-6 text-center text-sm text-mist">Nothing written here yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-white/5">
      {list.map((e, i) => (
        <li key={`${e.at_ms}-${i}`} className="flex items-start gap-3 py-2.5">
          <span aria-hidden className="mt-0.5 w-5 shrink-0 text-center text-lantern">
            {entryIcon(e.kind)}
          </span>
          <div className="flex-1 text-sm">
            <p className="text-paper">{e.text}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-mist/70">
              {formatDateTime(e.at_ms)}
              {txs?.[`${e.at_ms}|${e.kind}`] && (
                <a
                  href={`${CONFIG.explorer}/txns/${txs[`${e.at_ms}|${e.kind}`]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[#ffc93c] underline decoration-dotted underline-offset-2"
                  title="Open this transaction on NearBlocks"
                >
                  tx {txs[`${e.at_ms}|${e.kind}`].slice(0, 8)}… ↗
                </a>
              )}
            </p>
          </div>
          {e.yarn && e.yarn !== "0" && <span className="shrink-0 font-display text-sm text-lantern">{yarn(e.yarn)} YARN</span>}
        </li>
      ))}
    </ol>
  );
}

export default function Diary({ tokenId, refreshKey = 0 }: { tokenId: string; refreshKey?: number }) {
  const { data, error, loading, reload } = useAsync(() => getHistory(tokenId, 0, 200), [tokenId, refreshKey]);
  const txs = useDiaryTxs(tokenId, refreshKey);
  if (loading && !data) return <Loading label="Opening the diary…" />;
  if (error && !data)
    return (
      <Empty title="The diary is out of reach" action={<button className="btn btn-ghost btn-sm" onClick={reload}>Try again</button>}>
        {QUIET}
      </Empty>
    );
  return (
    <div className="card p-4 sm:p-5">
      <h3 className="mb-2 text-lg font-semibold">Diary</h3>
      <DiaryList entries={data ?? []} txs={txs} />
    </div>
  );
}
