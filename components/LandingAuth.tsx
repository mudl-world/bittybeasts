"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/ui/session";
import DemoPicker from "./DemoPicker";
import EmailSignIn from "./EmailSignIn";
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
          To your cat →
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <EmailSignIn
        blurb="No passwords, nothing to install. We email you a code, and a kitten moves into your room."
        onSignedIn={() => router.push("/room")}
      />
      <DemoPicker />
    </div>
  );
}
