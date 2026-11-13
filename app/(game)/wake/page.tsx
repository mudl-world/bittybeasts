import type { Metadata } from "next";
import { Suspense } from "react";
import WakeFlow from "@/components/WakeFlow";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Wake your Beast" };

// Opened by the QR card on the keychain: /wake?t=<tokenId>&s=<secret>
export default function WakePage() {
  return (
    <Suspense fallback={<Loading label="Something stirs…" />}>
      <WakeFlow />
    </Suspense>
  );
}
