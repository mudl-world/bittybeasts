"use client";
// One pending action at a time, friendly messages, and missing-key detection.
import { useCallback, useState } from "react";
import { friendly, isMissingKey } from "@/lib/ui/errors";

export type TxLike = { ok: boolean; error?: string };

export function useTx(onNeedsKey?: () => void) {
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const run = useCallback(
    async (label: string, fn: () => Promise<TxLike>, okText?: string): Promise<boolean> => {
      setPending(label);
      setNote(null);
      try {
        const r = await fn();
        if (r.ok) {
          if (okText) setNote({ kind: "ok", text: okText });
          return true;
        }
        const msg = r.error ?? "";
        if (isMissingKey(msg)) onNeedsKey?.();
        setNote({ kind: "err", text: friendly(msg) });
        return false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isMissingKey(msg)) onNeedsKey?.();
        setNote({ kind: "err", text: friendly(e) });
        return false;
      } finally {
        setPending(null);
      }
    },
    [onNeedsKey],
  );

  return { pending, note, setNote, run };
}
