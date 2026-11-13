# The world of Lantern Lane

Bitty Beasts has a setting but no script. Nobody writes the story and there is no last mission. Every night the
market, the merchant agents and the players produce new events, and the game turns them into story. This file covers
the world, the systems that keep it moving, and where each one lives in the code.

## The setting

When the city goes to sleep, its back alleys wake up. Strung over the rooftops is **the Great Yarn**: one enormous
ball of thread, and every lantern on **Lantern Lane** hangs from it. As long as the lanterns burn, the Lane is open.

- **Bitty Beasts** are strays that a spark from the Lane's old furnace woke up with a mind of their own. Each lives in a
  little room above the Lane with a chain for a tail: **nine links, nine lives**. It thinks (NEAR AI), gets hungry,
  sulks when ignored, dresses up, and pays its own way in YARN.
- **$YARN** is the Great Yarn's thread and the money of the Lane. The Yarn keeps spinning only if the cats tug it every
  night. When enough of them tug, fresh thread spins out to everyone who did. When too few come, a lantern goes dark and
  part of the treasury unravels.
- **The merchants:** Old Tom, a stingy fishmonger; Miso, a warm button seller; Bandit, who asks no questions; and
  Sister Clove, the healer who patches up whoever falls. Each keeps their own purse, shelf and nine lanterns.
- **The Gnawers** are rats. They steal off awnings and chew on the Great Yarn. Binding one with your chain earns the
  merchants' trust. Knocking goods off their awnings yourself earns the opposite.

All of the setting text lives in `lib/story/world.ts`.

## Nine lives, everywhere

| Who | Loses a life when | Comes back by | At zero |
| --- | --- | --- | --- |
| Your cat | It falls on a daring run (and gets a mark) | The daily boop of the real keychain | It rests: safe runs only |
| A shop | Its till runs dry at close | Players invest YARN | It retires and the slot opens |
| The alley | The cats miss the night's tug target | 7 good nights in a row | **The Long Dark** ends the Age |

## Why the story never ends

**1. Ages.** The alley's history is divided into Ages. An Age ends when the alley loses its ninth life: the Long Dark.
The streak goes back to zero, the lanterns are relit, and a new Age begins with its own name ("the Age of Wet
Rooftops"). Breaking the Longest Night record starts a Moon Festival within the Age. The Ages come from the $YARN
contract's own log, so they are real (`lib/story/ledger.ts: agesFrom`).

**2. Merchant fortunes.** The merchants are agents with their own NEAR accounts and keys. They price from their stock
and from tonight's demand (`lib/economy/pricing.ts`), restock from their own purses (`lib/server/keeper.ts`), go dark
when their till runs dry, and come back only if players invest. Flood Old Tom with fish and fish gets cheap. Starve him
and he pays well. Nobody scripts which shop fails.

**3. Nightly requests.** Merchants don't hand out fixed quests. Each night they post a request worked out from their
own shelves (`lib/economy/requests.ts`):
- an empty shelf posts a **want**, and anything sold toward it pays 25% more;
- a full shelf, or a fish glut, posts a **refusal**;
- a dark stall posts a call for investors;
- Sister Clove asks the whole alley to bind Gnawers, or to bring catnip after a night of falls.

The quote that a merchant signs includes the bonus, so the request is enforced by the same signed price the contract
verifies.

**4. The Lantern Ledger** (`/ledger`). A nightly paper written from contract records: the $YARN log (good nights, missed
nights, lives, records, the Long Dark), the alley's night stats (falls, Gnawers bound, goods sold, awning mischief), and
every cat's diary (first wakings, falls and marks, adoptions, new stalls). Nothing in it is invented
(`lib/story/ledger.ts: writeLedger`).

**5. Your cat's own story.** Marks from every fall, a reputation with each merchant as either a menace or a protector,
a best run, every past owner, and maybe Legend status. The life story page is `/beast/<token>`.

## The Lane runs itself

The keeper (`lib/server/keeper.ts`, `/api/keeper`) winds the clock. For every finished night it closes the market
(`alley.close_night`), settles the Great Yarn (`yarn.settle`), and lets each merchant agent decide whether to restock.
Both contract calls are public and idempotent. The game pings the keeper whenever someone opens the alley or the Ledger,
a cron can call `GET /api/keeper`, and `scripts/keeper.ts` runs it once a minute from a terminal. When you come back,
Sister Clove's "While you were away" card summarises the Ledger since your last visit.

## Onboarding

1. **The story film** (`/story`; it also plays the first time anyone reaches the alley): a 48-second animated cold
   open made with Remotion (`remotion/`). It covers the sleeping city, the kiln, the cat waking on its keyring with its
   nine links lighting, the Great Yarn spinning out its lanterns, and the Lane opening with the Gnawers' eyes in the
   dark. The world is drawn in code (`remotion/world.tsx`); the cats are the artist's existing art slots, so new art
   appears in the film automatically. It can be skipped. `pnpm story:render` writes `out/story.mp4` for the demo video,
   and `pnpm story:studio` opens it in Remotion Studio.
2. **Sister Clove** introduces herself. From then on she sits above the alley and reads the live Lane
   (`components/story/CloveGuide.tsx`):
   - if the Yarn needs tugs and your cat hasn't tugged, she sends you to prowl;
   - if a merchant wants something you're carrying, she sends you to sell it;
   - if a stall is dark, she asks you to invest;
   - if the night is calm, she suggests a daring run.

   Her advice changes as the world does, so it never runs out.
