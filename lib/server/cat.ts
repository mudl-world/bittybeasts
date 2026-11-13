// Server-only. Builds a cat's prompt from on-chain data only: the Beast, its care state (persona,
// fullness, happiness, outfit), its recent diary and its last few recorded thoughts. Because nothing
// else goes in, anyone can rebuild the exact request from the chain and check its sha256.
import { CONFIG } from "@/lib/chain/config";
import type { Beast, HistoryEntry } from "@/lib/chain/types";
import { view, type Care, type Thought } from "@/lib/chain/view";
import type { ChatMessage } from "./nearai";

export function defaultPersona(b: Beast): string {
  const { reach, grip, speed, luck } = b.stats;
  const top = Math.max(reach, grip, speed, luck);
  const trait =
    top === grip
      ? "fiercely protective of its friends and suspicious of rats"
      : top === speed
        ? "restless, always halfway out of the window"
        : top === reach
          ? "a show-off who knocks things off shelves to make a point"
          : "a dreamy optimist who believes every rooftop hides treasure";
  return `${b.name} is a small black alley cat, ${trait}. Curious, mischievous, brave, a little dramatic.`;
}

function mood(c: Care): string {
  const hunger = c.fullness < 15 ? "starving" : c.fullness < 40 ? "hungry" : c.fullness > 85 ? "stuffed" : "fine";
  const spirit = c.happiness < 20 ? "grumpy and lonely" : c.happiness < 50 ? "a bit bored" : c.happiness > 85 ? "delighted" : "content";
  return `${hunger}, ${spirit}`;
}

/** Everything the cat knows, read from the chain at this moment. */
export async function catContext(tokenId: string) {
  const [beast, care] = await Promise.all([
    view<Beast | null>(CONFIG.alley, "beast", { token_id: tokenId }),
    view<Care>(CONFIG.alley, "care", { token_id: tokenId }),
  ]);
  if (!beast) throw new Error("No such Beast");
  const [history, thoughts] = await Promise.all([
    view<HistoryEntry[]>(CONFIG.alley, "history", { token_id: tokenId, from: Math.max(0, 0), limit: 200 }),
    view<Thought[]>(CONFIG.alley, "thoughts", { token_id: tokenId, from: Math.max(0, care.thoughts - 4), limit: 4 }),
  ]);
  return { beast, care, history, thoughts };
}

export function buildMessages(ctx: Awaited<ReturnType<typeof catContext>>, said: string): ChatMessage[] {
  const { beast: b, care: c, history, thoughts } = ctx;
  const recent = history
    .filter((h) => h.kind !== "thought" && h.kind !== "think")
    .slice(-6)
    .map((h) => `- ${h.text}`)
    .join("\n");
  const system = [
    `You are ${b.name}, a Bitty Beast: a small black alley cat with big eyes and a chain for a tail.`,
    `Your tail has nine links, your nine lives. You live in a cosy room above Lantern Lane, a night market held up by the Great Yarn.`,
    `Who you are: ${c.persona.trim() || defaultPersona(b)}`,
    `Right now you feel ${mood(c)} (fullness ${c.fullness}/100, happiness ${c.happiness}/100). Lives lit: ${b.lives} of 9.`,
    b.marks.length ? `Marks from old falls: ${b.marks.map((m) => m.kind).join(", ")}.` : `No scars yet.`,
    c.outfit.length ? `You are wearing: ${c.outfit.join(", ")}.` : `You are wearing nothing but your fur.`,
    `Best daring run: ${b.best_run} rooftops.`,
    recent ? `Lately:\n${recent}` : "",
    `How to talk: you are the owner's pet cat talking back, like a cheeky talking pet. Reply in one to three short sentences (under 45 words).`,
    `You may add one *action* like *purrs* or *flicks tail*. Ask for fish when hungry, sulk when ignored, brag about rooftops.`,
    `YARN is the money of the Lane. Never mention blockchains, AI, models or prompts. Stay in character.`,
  ]
    .filter(Boolean)
    .join("\n");
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  for (const t of thoughts) {
    messages.push({ role: "user", content: t.said });
    messages.push({ role: "assistant", content: t.reply });
  }
  messages.push({ role: "user", content: said });
  return messages;
}

/** Trims to a byte budget without splitting characters (the contract caps strings in bytes). */
export function clipBytes(s: string, max: number): string {
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > max) break;
    out += ch;
  }
  return out;
}
