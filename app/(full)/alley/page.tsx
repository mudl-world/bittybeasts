import type { Metadata } from "next";
import { Suspense } from "react";
import Art from "@/components/Art";
import AlleyHub from "@/components/alley/AlleyHub";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Missions" };

// Full screen: the hub draws its own scene, HUD and dock. This backdrop and the centred column only
// show for the in-between states (signing in, loading, no cat yet).
export default function AlleyPage() {
  return (
    <>
      <div className="fixed inset-0" aria-hidden>
        <Art slot="hero-bg" alt="" className="h-full w-full scale-105 object-cover blur-[3px] brightness-[0.55] saturate-[0.8]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,transparent_25%,rgb(6_5_26/0.75)_80%)]" />
      </div>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
        <Suspense fallback={<Loading label="Padding into the alley…" />}>
          <AlleyHub />
        </Suspense>
      </div>
    </>
  );
}
