"use client";
// What the QR card on the keychain opens. Wakes a new Beast, boops an owned one,
// or offers adoption when the Beast is wandering.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adopt, bindKey, boop, cancelWander, getBeast, wakeBeast, type Beast } from "@/lib/chain";
import { catSlot, type Expression } from "@/lib/ui/art";
import { QUIET } from "@/lib/ui/errors";
import { formatDate, yoctoToNear } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session";
import { useAsync } from "@/lib/ui/useAsync";
import Art from "./Art";
import BeastCard, { Marks } from "./BeastCard";
import ChainTail from "./ChainTail";
import GoogleSignIn from "./GoogleSignIn";
import { Empty, Loading, Notice, Spinner } from "./ui";
import { useTx } from "./alley/useTx";

const WAKE_FACES: Expression[] = ["sleepy", "surprised", "curious", "happy"];

export default function WakeFlow() {
  const params = useSearchParams();
  const t = params.get("t") ?? "";
  const s = params.get("s") ?? "";
  const { session, ready } = useSession();
  const beast = useAsync(t ? () => getBeast(t) : null, [t]);

  if (!t || !s)
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Empty title="This collar tag link is missing its code">Open the collar tag link again; it carries the code.</Empty>

      </div>
    );
  if (beast.loading && !beast.data) return <Loading label="Something stirs…" />;
  if (beast.error && !beast.data)
    return (
      <Empty title="The alley is quiet" action={<button className="btn btn-ghost btn-sm" onClick={beast.reload}>Try again</button>}>
        {QUIET}
      </Empty>
    );
  const b = beast.data;
  if (!b) return <Empty title="We don't know this Beast">This cat isn&apos;t in the alley yet. Check the link, or ask the maker.</Empty>;

  if (!ready) return <Loading />;
  if (!session)
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
        <Art slot={catSlot(b.woken ? "curious" : "sleepy")} size={180} className="rounded-3xl" />
        <h1 className="text-3xl font-bold">{b.woken ? `${b.name} looks up at you` : `${b.name} is fast asleep`}</h1>
        <div className="w-full text-left">
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <h3 className="text-lg font-semibold">{b.woken ? "Sign in to continue" : `Sign in to wake ${b.name}`}</h3>
              <p className="text-sm text-mist">One tap. Your Beast&apos;s key stays on this phone.</p>
            </div>
            <GoogleSignIn />
          </div>
        </div>
      </div>
    );

  const me = session.accountId;
  return <ScanAction beast={b} me={me} tokenId={t} secret={s} reload={beast.reload} />;
}

function ScanAction({ beast, me, tokenId, secret, reload }: { beast: Beast; me: string; tokenId: string; secret: string; reload: () => void }) {
  const tx = useTx();
  const [anim, setAnim] = useState<null | "wake" | "boop" | "adopt">(null);

  if (anim) return <Celebration beast={beast} kind={anim} />;

  // 1. Never woken: claim it.
  if (!beast.woken) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
        <Art slot="cat-sleepy" size={220} className="rounded-3xl" />
        <h1 className="text-3xl font-bold">{beast.name} is fast asleep</h1>
        <p className="text-mist">A tiny black cat, curled up asleep. Nine dark links on its tail. Give it a nudge?</p>
        <ChainTail lives={0} size="lg" />
        <button
          className="btn btn-lantern px-8 py-4 text-lg"
          disabled={!!tx.pending}
          onClick={async () => {
            if (await tx.run("wake", () => wakeBeast(tokenId, secret))) {
              setAnim("wake");
              reload();
            }
          }}
        >
          {tx.pending ? <Spinner /> : null} Wake {beast.name}
        </button>
        {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
      </div>
    );
  }

  // 2. Wandering: adopt (or, for the seller, call it home).
  if (beast.wander) {
    const price = yoctoToNear(beast.wander.price);
    if (beast.wander.seller === me) {
      return (
        <div className="card mx-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center">
          <Art slot="cat-curious" size={180} className="rounded-3xl" />
          <h1 className="text-2xl font-bold">{beast.name} is wandering</h1>
          <p className="text-sm text-mist">Looking for a new home at {price} NEAR. Share this collar tag link; the new owner opens it to adopt.</p>
          <button
            className="btn btn-ghost"
            disabled={!!tx.pending}
            onClick={async () => {
              if (await tx.run("cancel", () => cancelWander(tokenId), `${beast.name} came home.`)) reload();
            }}
          >
            {tx.pending ? <Spinner /> : null} Call {beast.name} home
          </button>
          {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
        </div>
      );
    }
    return (
      <div className="card mx-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center">
        <BeastCard beast={beast} expression="curious" size={160} />
        <p className="text-mist">
          {beast.name} is wandering and looking for a new home. Every scar and story comes along. The maker gets a small share.
        </p>
        <button
          className="btn btn-lantern px-8 py-4 text-lg"
          disabled={!!tx.pending}
          onClick={async () => {
            if (await tx.run("adopt", () => adopt(tokenId, secret, beast.wander?.price ?? "0"))) {
              setAnim("adopt");
              reload();
            }
          }}
        >
          {tx.pending ? <Spinner /> : null} Adopt for {price} NEAR
        </button>
        {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
        <Link href={`/beast/${tokenId}`} className="text-xs text-mist underline underline-offset-4">
          Read {beast.name}&apos;s life story first
        </Link>
      </div>
    );
  }

  // 3. Mine: the daily boop.
  if (beast.owner_id === me) {
    return (
      <div className="card mx-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center">
        <Art slot="cat-curious" size={200} className="rounded-3xl" />
        <h1 className="text-3xl font-bold">Boop {beast.name}?</h1>
        <p className="text-sm text-mist">One boop a day wins a life back, and checks your cat in for the night.</p>
        <ChainTail lives={beast.lives} legend={beast.legend} size="lg" />
        <button
          className="btn btn-lantern btn-lg"
          disabled={!!tx.pending}
          onClick={async () => {
            if (await tx.run("boop", () => boop(tokenId, secret))) {
              setAnim("boop");
              reload();
            }
          }}
        >
          {tx.pending === "boop" ? <Spinner /> : null} Boop!
        </button>
        {tx.note && <Notice kind={tx.note.kind}>{tx.note.text}</Notice>}
        <div className="flex flex-col items-center gap-1 pt-2 text-xs text-mist">
          <span>New phone?</span>
          <button
            className="underline underline-offset-4 hover:text-paper"
            disabled={!!tx.pending}
            onClick={() => tx.run("bind", () => bindKey(tokenId), `${beast.name} knows this phone now.`)}
          >
            {tx.pending === "bind" ? <Spinner /> : null} Use this phone for {beast.name}
          </button>
        </div>
        <Link href="/alley" className="btn btn-ghost btn-sm">
          Into the alley <Art slot="ui-forward" alt="" size={18} />
        </Link>
      </div>
    );
  }

  // 4. Someone else's Beast.
  return (
    <div className="card mx-auto flex max-w-xl flex-col items-center gap-4 p-6 text-center">
      <BeastCard beast={beast} size={160} />
      <p className="text-mist">{beast.name} already has a home. You can read its life story, though.</p>
      <Link href={`/beast/${tokenId}`} className="btn btn-ghost">
        Life story
      </Link>
    </div>
  );
}

/** Wake: sleepy → surprised → curious → happy, then nine links light one by one, then the details. */
function Celebration({ beast, kind }: { beast: Beast; kind: "wake" | "boop" | "adopt" }) {
  // Captured once: the Beast reloads underneath us while the animation plays.
  const [{ startLives, endLives }] = useState(() => ({
    startLives: kind === "boop" ? Math.max(0, beast.lives) : 0,
    endLives: kind === "boop" ? Math.min(9, beast.lives + 1) : kind === "wake" ? 9 : beast.lives,
  }));
  const faces: Expression[] = kind === "wake" ? WAKE_FACES : kind === "boop" ? ["surprised", "happy"] : ["curious", "happy"];
  const [face, setFace] = useState(0);
  const [lit, setLit] = useState(startLives);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    const faceStep = kind === "wake" ? 900 : 600;
    faces.forEach((_, i) => timers.push(window.setTimeout(() => setFace(i), i * faceStep)));
    const linkStart = faces.length * faceStep;
    const linkStep = kind === "wake" ? 260 : 400;
    for (let n = startLives + 1; n <= endLives; n++) {
      timers.push(window.setTimeout(() => setLit(n), linkStart + (n - startLives - 1) * linkStep));
    }
    timers.push(window.setTimeout(() => setDone(true), linkStart + Math.max(1, endLives - startLives) * linkStep + 300));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // Runs once per celebration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline =
    kind === "wake" ? `${beast.name} is awake!` : kind === "adopt" ? `${beast.name} is yours now` : endLives > startLives ? "Boop! A link glows again." : "Boop! The tail was already full.";

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
      <Art key={face} slot={catSlot(faces[face])} size={240} className="animate-pop rounded-3xl" />
      <ChainTail lives={lit} legend={beast.legend} flash={lit - 1} size="lg" />
      {done && (
        <div className="flex flex-col items-center gap-2 animate-rise">
          <h1 className="text-4xl font-bold">{headline}</h1>
          <p className="text-mist">
            <b className="text-paper">{beast.name}</b> · made by {beast.maker} · born {formatDate(beast.born_ms)}
          </p>
          {kind === "boop" && endLives === startLives && <p className="text-sm text-mist">Your cat is still checked in for tonight. Come back tomorrow night.</p>}
          {kind !== "wake" && <Marks beast={beast} />}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/alley" className="btn btn-lantern">
              {kind === "wake" ? "First prowl" : "Into the alley"} <Art slot="ui-forward" alt="" size={22} />
            </Link>
            <Link href={`/beast/${beast.token_id}`} className="btn btn-ghost">
              Life story
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
