"use client";
import { useRouter } from "next/navigation";
import ColdOpen from "./ColdOpen";

export default function StoryIntro() {
  const router = useRouter();
  return <ColdOpen doneLabel="Into your room" onDone={() => router.push("/room")} />;
}
