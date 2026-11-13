import type { Metadata } from "next";
import Activity from "@/components/Activity";

export const metadata: Metadata = { title: "On-chain activity" };

export default function Page() {
  return <Activity />;
}
