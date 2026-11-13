"use client";
// Minimal data loader for client components: runs `fn` after mount and whenever deps change.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from "react";

export type AsyncState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

export function useAsync<T>(fn: (() => Promise<T>) | null, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(fn !== null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    const f = fnRef.current;
    if (!f) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    f().then(
      (v) => {
        if (!live) return;
        setData(v);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!live) return;
        setError(e ?? new Error("failed"));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, fn === null]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Runs one action at a time and remembers its friendly error/success note. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const runAction = useCallback(
    async <R>(label: string, fn: () => Promise<R>, onDone?: (r: R) => void): Promise<R | undefined> => {
      setPending(label);
      setNote(null);
      try {
        const r = await fn();
        onDone?.(r);
        return r;
      } finally {
        setPending(null);
      }
    },
    [],
  );
  return { pending, note, setNote, runAction };
}
