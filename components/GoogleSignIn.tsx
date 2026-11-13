"use client";
// Google sign-in, in the game's own button. Google's rendered button is an iframe we cannot restyle,
// so we draw our own and drive the flow ourselves. We ask for an ID token (not an auth code): the
// token flow needs no client secret, and the server verifies the token's signature against Google's
// published keys, so nothing the browser claims about who you are is trusted — see lib/server/auth.
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
      initialize: (o: {
        client_id: string;
        callback: (r: Credential) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
      }) => void;
      prompt: () => void;
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
  // Google's own button, rendered into a hidden slot. Our themed button forwards clicks to it:
  // Google requires their asset for the real gesture, and one-tap `prompt()` is suppressed too
  // often (FedCM, third-party cookie rules) to be the only way in.
  const hidden = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!CLIENT_ID || !hidden.current) return;
    loadGsi()
      .then((google) => {
        if (!live.current || !hidden.current) return;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (res: Credential) => {
            if (!res.credential) {
              if (live.current) setError("Google didn't complete that sign-in. Try again.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const { accountId } = await signInWithGoogle(res.credential);
              notifySession();
              onSignedIn?.(accountId);
            } catch (err) {
              if (live.current) setError(friendly(err, "We couldn't finish that Google sign-in. Try again."));
            } finally {
              if (live.current) setBusy(false);
            }
          },
        });
        google.accounts.id.renderButton(hidden.current, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "left",
          width: 300,
        });
        setReady(true);
      })
      .catch((e: unknown) => {
        if (live.current) setError(friendly(e, "Google sign-in could not be reached."));
      });
  }, [onSignedIn]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {/* Google's own button, shown rather than proxied.
          A themed button of ours that forwards the click only works while Google renders a DOM
          [role=button]: in production it renders an <iframe> instead, and nothing can synthesise a
          click inside a cross-origin frame — the button looked right and did nothing. So this is
          Google's real button, centred and sized to the card. */}
      <div ref={hidden} className="flex min-h-[44px] w-full justify-center [color-scheme:light]" aria-busy={busy} />
      {!ready && !error && <p className="text-center text-xs text-mist">Waking the gate…</p>}
      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm text-mist">
          <Spinner /> Setting up your room…
        </p>
      )}
      {error && <Notice kind="err">{error}</Notice>}
    </div>
  );
}
