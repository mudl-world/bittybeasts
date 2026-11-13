// The story film: six scenes in a row, each with its caption. Used by the Remotion CLI (render to MP4)
// and by @remotion/player inside the game at /story.
import { AbsoluteFill, Series } from "remotion";
import { CityScene, Caption, KilnScene, LaneScene, TitleScene, WakeScene, YarnScene } from "./scenes";
import { COLORS, SCENES, type SceneId } from "./script";

const SCENE: Record<SceneId, (p: { frames: number }) => React.ReactNode> = {
  city: CityScene,
  kiln: KilnScene,
  wake: WakeScene,
  yarn: YarnScene,
  lane: LaneScene,
  title: TitleScene,
};

export default function StoryFilm() {
  return (
    <AbsoluteFill style={{ background: COLORS.night950 }}>
      <Series>
        {SCENES.map((s) => {
          const Scene = SCENE[s.id];
          return (
            <Series.Sequence key={s.id} durationInFrames={s.frames} name={s.title || "Title"}>
              <Scene frames={s.frames} />
              <Caption title={s.title} text={s.text} frames={s.frames} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
}
