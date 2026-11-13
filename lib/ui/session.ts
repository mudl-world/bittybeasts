"use client";
// Reactive wrapper around session() from the chain layer. The session lives in localStorage,
// so the server snapshot is always "signed out" and the browser fills it in after hydration.
import { useMemo, useSyncExternalStore } from "react";
import { session, signOut as chainSignOut } from "@/lib/chain";

export type Session = { accountId: string; email?: string };

const EVENT = "bb:session";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Snapshots must be stable between calls, so compare by string.
function snapshot(): string {
  const s = session();
  return s ? JSON.stringify({ accountId: s.accountId, email: s.email }) : "";
}

const serverSnapshot = () => "";
// "ready" is false during the server render and the first hydration pass.
const readySnapshot = () => true;
const notReady = () => false;
const noop = () => () => {};

export function useSession(): { session: Session | null; ready: boolean } {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = useSyncExternalStore(noop, readySnapshot, notReady);
  const parsed = useMemo(() => (raw ? (JSON.parse(raw) as Session) : null), [raw]);
  return { session: parsed, ready };
}

export function notifySession() {
  window.dispatchEvent(new Event(EVENT));
}

export function signOut() {
  chainSignOut();
  notifySession();
}
