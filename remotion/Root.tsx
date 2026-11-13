import { Composition } from "remotion";
import StoryFilm from "./StoryFilm";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./script";

export function RemotionRoot() {
  return <Composition id="StoryFilm" component={StoryFilm} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />;
}
