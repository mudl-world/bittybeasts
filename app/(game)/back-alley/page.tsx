import type { Metadata } from "next";
import BackAlley from "@/components/BackAlley";

export const metadata: Metadata = { title: "The Back Alley" };

export default function Page() {
  return <BackAlley />;
}
