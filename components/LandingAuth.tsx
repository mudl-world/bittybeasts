"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/ui/session";
import Art from "./Art";
import DemoPicker from "./DemoPicker";
import GoogleSignIn from "./GoogleSignIn";
import { Spinner } from "./ui";

export default function LandingAuth() {
  const { session, ready } = useSession();
  const router = useRouter();
  if (!ready)
    return (
      <div className="card flex items-center gap-3 p-5 text-mist">
        <Spinner /> Checking your pockets…
      </div>
    );
  if (session)
    return (
      <div className="card flex flex-col gap-3 p-5">
        <p className="text-sm text-mist">
          Welcome back{session.email ? <>, <b className="text-paper">{session.email}</b></> : null}.
        </p>
        <Link href="/room" className="btn btn-lantern self-start">
          To your cat <Art slot="ui-forward" alt="" size={22} />
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-lg font-semibold">Sign in</h3>
          <p className="text-sm text-mist">No passwords, nothing to install. A kitten moves into your room.</p>
        </div>
        <GoogleSignIn onSignedIn={() => router.push("/room")} />
      </div>
      <div className="card flex flex-col gap-3 p-5">
        <div>
          <p className="font-display text-lg font-semibold">Just looking? Borrow a cat</p>
          <p className="text-sm text-mist">Shared demo cats on testnet, so expect other paws on them.</p>
        </div>
        <DemoPicker />
      </div>
    </div>
  );
}
