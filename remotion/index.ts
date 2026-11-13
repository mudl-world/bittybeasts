// Remotion entry point: `npx remotion studio remotion/index.ts` to preview,
// `npx remotion render remotion/index.ts StoryFilm out/story.mp4` to render.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
