import type { Metadata } from "next";
import Ledger from "@/components/story/Ledger";

export const metadata: Metadata = { title: "The Lantern Ledger" };

export default function Page() {
  return <Ledger />;
}
