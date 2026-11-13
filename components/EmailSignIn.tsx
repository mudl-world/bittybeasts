"use client";
// Email + 6-digit code sign-in. No passwords, no extensions: a key is made on this phone.
import { useState } from "react";
import { startEmailLogin, verifyEmailLogin } from "@/lib/chain";
import { friendly } from "@/lib/ui/errors";
import { notifySession } from "@/lib/ui/session";
import { Notice, Spinner } from "./ui";

type Props = { title?: string; blurb?: string; onSignedIn?: (accountId: string) => void; compact?: boolean };

export default function EmailSignIn({ title = "Sign in with email", blurb, onSignedIn, compact = false }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("That email doesn't look right.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startEmailLogin(email.trim());
      setDevCode(res.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(friendly(err, "We couldn't send a code just now. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accountId } = await verifyEmailLogin(email.trim(), code.trim());
      notifySession();
      onSignedIn?.(accountId);
    } catch (err) {
      setError(friendly(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex flex-col gap-3" : "card flex flex-col gap-3 p-5"}>
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      {blurb && <p className="text-sm text-mist">{blurb}</p>}
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="bb-email">
            Email
          </label>
          <input
            id="bb-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn btn-lantern shrink-0" disabled={busy}>
            {busy ? <Spinner /> : null} Send me a code
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-2">
          <p className="text-sm text-mist">
            We sent a 6-digit code to <b className="text-paper">{email}</b>.
          </p>
          {devCode && (
            <Notice kind="info">
              Demo mode: email isn&apos;t set up, so here&apos;s your code: <b className="font-display tracking-widest text-lantern">{devCode}</b>
            </Notice>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="bb-code">
              Code
            </label>
            <input
              id="bb-code"
              className="input font-display text-lg tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
            <button className="btn btn-lantern shrink-0" disabled={busy || code.length < 6}>
              {busy ? <Spinner /> : null} Let me in
            </button>
          </div>
          <button
            type="button"
            className="self-start text-xs text-mist underline underline-offset-4"
            onClick={() => {
              setStep("email");
              setCode("");
              setDevCode(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
      {error && <Notice kind="err">{error}</Notice>}
    </div>
  );
}
