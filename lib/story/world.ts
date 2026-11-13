// =============================================================================
//  THE WORLD OF LANTERN LANE — the setting, in one file.
//
//  Nothing here is a script the player finishes. The setting explains why the
//  rules exist; the story itself is written every night by what players and
//  merchant agents actually do (see ledger.ts and requests.ts).
// =============================================================================

export const WORLD = {
  name: "Lantern Lane",
  oneLine: "A night market in the back alleys of a sleeping city, open from dusk to dawn, held up by one ball of yarn.",
  setting:
    "When the city goes to sleep, its back alleys wake up. Strung over the rooftops is the Great Yarn: one enormous ball of thread, and every lantern on Lantern Lane hangs from it. As long as the lanterns burn, the Lane is open. Merchants trade, cats prowl the roofs for anything shiny, and the Gnawers keep to the shadows.",
  greatYarn:
    "The Great Yarn stays alive only if the alley's cats tug it every night. When enough of them show up, fresh thread spins out to everyone who tugged: that thread is $YARN, the money of the Lane. When too few come, a lantern goes dark and some of the yarn unravels.",
  beasts:
    "Some nights a spark from the Lane's old furnace lands on a stray, and it wakes up with a mind of its own. It moves into a little room above the Lane with a chain for a tail: nine links, nine lives. It thinks, talks, gets hungry and sulks, and it pays its own way in YARN.",
  nineLives:
    "Everything on the Lane has nine lives: your cat, every shop, and the alley itself. A cat loses one when it falls from a roof. A shop loses one when its till runs dry. The alley loses one when its cats don't show up. Nothing is ever erased. A fall leaves a mark, a dark stall waits for someone to invest, and a dead alley starts a new Age.",
  gnawers:
    "The Gnawers are rats. They steal off awnings and chew on the Great Yarn. A cat that binds one with its chain earns the merchants' trust. A cat that knocks goods off the awnings itself earns something else.",
  autonomous:
    "The Lane runs itself. Four merchant cats keep their own purses and shelves and set their own prices. They post their own requests, go broke, and close their own shutters. The night ends, the yarn settles, and your cat minds your stall while you're away. Come back tomorrow and the Ledger tells you what happened.",
  longDark:
    "If the alley loses all nine lives, the Long Dark falls. Every lantern goes out, the streak goes back to nothing, and the Lane is relit from scratch. That ends one Age of the Lane and begins the next.",
} as const;

/** Ages are numbered from 1. An Age ends when the alley runs out of lives (the Long Dark). */
const AGE_NAMES = [
  "the First Lantern",
  "Wet Rooftops",
  "the Quiet Bell",
  "Tom's Grudge",
  "the Silver Moon",
  "Long Whiskers",
  "the Unravelling",
  "Soft Paws",
  "the Bent Ear",
  "Copper Buttons",
  "Nine Knots",
  "the Gnawer King",
];
const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];

export function ageName(age: number): string {
  return `The Age of ${AGE_NAMES[(age - 1) % AGE_NAMES.length]}`;
}
export function ageOrdinal(age: number): string {
  return age <= ORDINAL.length ? `${ORDINAL[age - 1]} Age` : `Age ${age}`;
}

/** Sister Clove: the Lane's healer and the player's guide. */
export const CLOVE = {
  name: "Sister Clove",
  intro: "Welcome to the Lane, little one. I'm Clove, and I patch up whoever falls off the roofs. Nobody gives out missions here. The Lane tells you what it needs, if you listen.",
} as const;
