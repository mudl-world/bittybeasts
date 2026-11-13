import type { Metadata } from "next";
import StoryIntro from "@/components/story/StoryIntro";

export const metadata: Metadata = { title: "The story" };

export default function Page() {
  return <StoryIntro />;
}
