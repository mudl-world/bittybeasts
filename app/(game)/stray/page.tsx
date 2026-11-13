import type { Metadata } from "next";
import Prowl from "@/components/Prowl";

export const metadata: Metadata = { title: "Play as a stray" };

export default function StrayPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">Play as a stray</h1>
        <p className="text-sm text-mist">No cat of your own, no sign-in. Safe prowls only, and nothing is kept. Get a feel for the rooftops.</p>
      </div>
      <Prowl beast={null} />
    </div>
  );
}
