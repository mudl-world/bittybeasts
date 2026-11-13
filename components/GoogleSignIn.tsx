"use client";
// Google sign-in. Renders Google's own button through Google Identity Services, hands the ID token
// to the server to verify, and lands the player in the same account the email code flow would give
// that address. Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so the email flow below
// it stays the whole story on a server that has not configured Google.
import { useEffect, useRef, useState } from "react";
import { signInWithGoogle } from "@/lib/chain";
import { friendly } from "@/lib/ui/errors";
import { notifySession } from "@/lib/ui/session";
import { Notice, Spinner } from "./ui";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

type Credential = { credential?: string };
type Gsi = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: Credential) => void; auto_select?: boolean }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

/** Loads the GSI script once per page, even if several of these mount. */
function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi; __bbGsi?: Promise<Gsi> };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  if (w.__bbGsi) return w.__bbGsi;
  w.__bbGsi = new Promise<Gsi>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = GSI_SRC;
    el.async = true;
    el.onload = () => (w.google?.accounts?.id ? resolve(w.google) : reject(new Error("Google sign-in failed to start")));
    el.onerror = () => reject(new Error("Google sign-in could not be reached"));
    document.head.appendChild(el);
  });
  return w.__bbGsi;
}

export default function GoogleSignIn({ onSignedIn }: { onSignedIn?: (accountId: string) => void }) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Google's script is blocked in some networks and extensions; keep our own layout until it paints.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || !slot.current) return;
    let live = true;

    loadGsi()
      .then((google) => {
        if (!live || !slot.current) return;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (res: Credential) => {
            if (!res.credential) {
              setError("Google didn't return a sign-in. Try again, or use your email below.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const { accountId } = await signInWithGoogle(res.credential);
              notifySession();
              onSignedIn?.(accountId);
            } catch (err) {
              setError(friendly(err, "We couldn't finish that Google sign-in. Try again, or use your email below."));
            } finally {
              if (live) setBusy(false);
            }
          },
        });
        google.accounts.id.renderButton(slot.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: 320,
        });
        setReady(true);
      })
      .catch(() => {
        // Leave `ready` false: the card explains itself and the email form still works.
        if (live) setError(null);
      });

    return () => {
      live = false;
    };
  }, [onSignedIn]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={slot} className="min-h-[44px]" aria-busy={busy} />
      {!ready && !error && <p className="text-xs text-mist">Loading Google sign-in…</p>}
      {busy && (
        <p className="flex items-center gap-2 text-sm text-mist">
          <Spinner /> Setting up your room…
        </p>
      )}
      {error && <Notice kind="err">{error}</Notice>}
    </div>
  );
}
