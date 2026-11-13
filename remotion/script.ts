// The story film: one scene per beat of the cold open. Shared by the Remotion film and the game.
// Frames are at 30 fps. Keep this file free of app imports: the Remotion bundler reads it too.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type SceneId = "city" | "kiln" | "wake" | "yarn" | "lane" | "title";

export const SCENES: { id: SceneId; title: string; text: string; frames: number }[] = [
  {
    id: "city",
    title: "The city sleeps",
    text: "The last tram rattles home. Windows go dark one by one. Down in the back alleys, something has been waiting for this.",
    frames: 240,
  },
  {
    id: "kiln",
    title: "A spark in the dark",
    text: "Some nights a spark drifts down a back alley and lands on a sleeping stray. That stray wakes up with a mind of its own.",
    frames: 240,
  },
  {
    id: "wake",
    title: "Eyes open",
    text: "It opens its eyes in a little room above the Lane, and its tail lights up one link at a time. Nine links. Nine lives.",
    frames: 270,
  },
  {
    id: "yarn",
    title: "The Great Yarn",
    text: "Over the rooftops hangs the Great Yarn, and every lantern on the Lane hangs from it. Cats tug it each night to keep it spinning. Its thread is YARN, the money of the Lane.",
    frames: 270,
  },
  {
    id: "lane",
    title: "Lantern Lane",
    text: "Below, the market opens. Old Tom grumbles over his fish. Miso counts her buttons. Bandit asks no questions. Sister Clove watches the rooftops. And the Gnawers watch too.",
    frames: 300,
  },
  {
    id: "title",
    title: "",
    text: "A cat with a mind of its own. Nine lives to spend.",
    frames: 150,
  },
];

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

export const COLORS = {
  night950: "#06051a",
  night900: "#0c0a26",
  night800: "#15123d",
  night700: "#211d57",
  night600: "#332d7a",
  night500: "#4b44a3",
  mist: "#a9a4e0",
  paper: "#fff3dc",
  lantern: "#ffb547",
  lanternDeep: "#ff8a1f",
  ember: "#ff5e3a",
  moss: "#7ed6a0",
  yarn: "#e8735a",
  yarnLight: "#f6a07c",
  yarnDark: "#b84a3a",
} as const;

export const DISPLAY_FONT = "var(--font-display-face, 'Fredoka'), ui-rounded, 'Trebuchet MS', system-ui, sans-serif";
