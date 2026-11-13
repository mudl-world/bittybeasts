import type { Metadata } from "next";
import CatRoom from "@/components/room/CatRoom";

export const metadata: Metadata = { title: "Your cat's room" };

export default function Page() {
  return <CatRoom />;
}
