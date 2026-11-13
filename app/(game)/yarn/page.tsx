import type { Metadata } from "next";
import YarnPage from "@/components/YarnPage";

export const metadata: Metadata = { title: "$YARN" };

export default function Page() {
  return <YarnPage />;
}
