// =============================================================================
//  $YARN — the alley's nine lives, as plain TypeScript.
//
//  This file mirrors the rules compiled into the $YARN contract (contracts/yarn)
//  so the simulators and the token page can explain them without a chain call.
//  Constants are the same as docs/ARCHITECTURE.md.
//
//  The whole idea in one breath:
//    Every night, each Beast that finishes a prowl (or gets a boop) "tugs" the
//    yarn once. If at least 60% of registered Beasts tugged, it is a GOOD night:
//    every tugger gets 10 fresh YARN and the streak grows. If not, it is a MISS:
//    the alley loses one of its nine lives and 5% of the treasury is burned.
//    When the alley runs out of lives the streak resets to 0 and lives refill.
//    Seven good nights in a row earn one life back.
//
//  Words used below:
//    streak  — good nights since the last reset (a miss costs a life, not the streak)
//    run     — consecutive good nights (a miss sets it to 0); drives life regen
//    longest — the best streak ever ("The Longest Night")
//    record  — the Longest Night as it stood when the current streak began.
//              Passing it breaks the record and lights the Moon Festival.
// =============================================================================

/** Basis points: 10_000 = 100%. */
export const YARN_RULES = {
  /** A night is good when tugs >= 60% of registered Beasts. */
  target_bps: 6000,
  /** Fresh YARN minted to each tugger on a good night. */
  mint_per_tug: 10,
  /** Share of the treasury burned on a missed night (5%). */
  burn_bps: 500,
  /** The alley has nine lives. */
  max_lives: 9,
  /** One life comes back after this many consecutive good nights. */
  regen_every: 7,
} as const;

export type YarnSimState = {
  night: number;
  /** All YARN in existence (Beasts + merchant tills + treasury). */
  total_supply: number;
  /** YARN held by the contract itself (rent + market fees). Burns come from here. */
  treasury: number;
  streak: number;
  run: number;
  longest: number;
  /** Longest Night when the current streak began; beating it = Moon Festival. */
  record: number;
  lives: number;
  /** True for the one night after the record was broken. */
  festival: boolean;
};

export type NightOutcome = {
  night: number;
  tugs: number;
  registered: number;
  /** Tugs needed tonight: ceil(60% of registered). */
  target: number;
  hit: boolean;
  minted: number;
  burned: number;
  lifeLost: boolean;
  lifeBack: boolean;
  /** The alley ran out of lives: streak -> 0, lives -> 9. */
  reset: boolean;
  /** Streak passed the Longest Night: the Moon Festival is tomorrow. */
  recordBroken: boolean;
};

export function initialYarnState(partial: Partial<YarnSimState> = {}): YarnSimState {
  return {
    night: 0,
    total_supply: 0,
    treasury: 0,
    streak: 0,
    run: 0,
    longest: 0,
    record: 0,
    lives: YARN_RULES.max_lives,
    festival: false,
    ...partial,
  };
}

/** How many tugs a night needs to count as good. */
export function targetFor(registered: number): number {
  return Math.ceil((registered * YARN_RULES.target_bps) / 10_000);
}

/** What a miss would burn right now. */
export function burnFor(treasury: number): number {
  return Math.floor((treasury * YARN_RULES.burn_bps) / 10_000);
}

/**
 * Will a good night tonight break the record (and so light the festival tomorrow)?
 * Old Tom watches this: he pays double for fish the night before the Moon Festival.
 * There must be a record to break, so the very first streak never triggers it.
 */
export function recordWithinReach(state: YarnSimState): boolean {
  return state.record > 0 && state.streak === state.record;
}

/** Rent and the 2% market fee move existing YARN into the treasury (no minting). */
export function depositToTreasury(state: YarnSimState, amount: number): YarnSimState {
  return { ...state, treasury: state.treasury + Math.max(0, Math.floor(amount)) };
}

/**
 * Settle one night. Pure: returns the new state and what happened.
 * Minted YARN goes to the tuggers (the caller decides who they are);
 * burned YARN leaves the treasury and total supply.
 */
export function settleNight(
  state: YarnSimState,
  tugs: number,
  registered: number,
): { state: YarnSimState; outcome: NightOutcome } {
  const target = targetFor(registered);
  const hit = registered > 0 && tugs >= target;
  const next: YarnSimState = { ...state, night: state.night + 1, festival: false };
  const outcome: NightOutcome = {
    night: state.night,
    tugs,
    registered,
    target,
    hit,
    minted: 0,
    burned: 0,
    lifeLost: false,
    lifeBack: false,
    reset: false,
    recordBroken: false,
  };

  if (hit) {
    // Good night: everyone who tugged gets fresh YARN.
    outcome.minted = tugs * YARN_RULES.mint_per_tug;
    next.total_supply += outcome.minted;
    next.streak += 1;
    next.run += 1;

    // Seven good nights in a row win a life back.
    if (next.run % YARN_RULES.regen_every === 0 && next.lives < YARN_RULES.max_lives) {
      next.lives += 1;
      outcome.lifeBack = true;
    }

    // Passing the record held when this streak began = Moon Festival tomorrow.
    if (state.record > 0 && state.streak === state.record) {
      outcome.recordBroken = true;
      next.festival = true;
    }
    next.longest = Math.max(next.longest, next.streak);
  } else {
    // Missed night: lose a life, burn 5% of the treasury, regen run starts over.
    outcome.burned = burnFor(state.treasury);
    next.treasury -= outcome.burned;
    next.total_supply -= outcome.burned;
    next.lives -= 1;
    next.run = 0;
    outcome.lifeLost = true;

    // Out of lives: the streak resets and the alley gets all nine back.
    if (next.lives <= 0) {
      outcome.reset = true;
      next.streak = 0;
      next.lives = YARN_RULES.max_lives;
      next.record = next.longest; // the next streak has this to beat
    }
  }

  return { state: next, outcome };
}
