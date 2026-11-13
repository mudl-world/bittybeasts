"use client";
// For demo Beasts only: stands in for tapping the real keychain (daily boop, or adopting it when
// it wanders). The secret comes from the public testnet demo file.
import Link from "next/link";
import { useEffect, useState } from "react";
import { listDemoAccounts } from "@/lib/chain";
import Art from "./Art";

export default function DemoKeychain({ tokenId }: { tokenId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  useEffect(() => {
    listDemoAccounts()
      .then((all) => setSecret(all.find((d) => d.beast?.tokenId === tokenId)?.beast?.keychainSecret ?? null))
      .catch(() => setSecret(null));
  }, [tokenId]);
  if (!secret) return null;
  return (
    <Link
      href={`/wake?t=${tokenId}&s=${secret}`}
      className="btn btn-ghost btn-sq h-14 w-14 shrink-0 p-1"
      aria-label="Demo cat's collar tag (cuddle, or adopt it when it wanders)"
      title="Demo cat's collar tag (cuddle, or adopt it when it wanders)"
    >
      <Art slot="ui-cuddle" alt="" size={40} />
    </Link>
  );
}
