import type { Metadata } from "next";
import { Suspense } from "react";
import LifeStory from "@/components/LifeStory";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Life story" };

export default function BeastPage({ params }: PageProps<"/beast/[id]">) {
  return (
    <Suspense fallback={<Loading label="Turning the pages…" />}>
      {params.then(({ id }) => (
        <LifeStory tokenId={decodeURIComponent(id)} />
      ))}
    </Suspense>
  );
}
