import type { AdCandidate } from "../schemas/context";

/**
 * Live NBA Finals broadcast ad system. The broadcast has exactly two hardcoded
 * ad slots. AD_SLOT_1 fires at the first natural break; AD_SLOT_2 fires at
 * halftime and adapts to how the viewer reacted during AD_SLOT_1.
 *
 * No LLM is involved. Slot content and Ad-2 adaptation are deterministic so the
 * broadcast demo is stable for judges.
 */

/**
 * A single hardcoded broadcast ad slot.
 *
 * - `adIndex`      0 for the first slot, 1 for the second.
 * - `triggerMoment` the in-game broadcast beat that cues the slot.
 * - `tavusContext`  the conversational_context handed to the Tavus agent.
 * - `adCandidate`   the product pitched in this slot.
 */
export type AdFixture = {
  adIndex: number;
  triggerMoment: string;
  tavusContext: string;
  adCandidate: AdCandidate;
};

/**
 * One recorded interaction from a prior ad slot, used to make AD_SLOT_2
 * arc-aware. `emotionSignal` mirrors FrictionAnalysis.emotionSignal (kept as a
 * string so the arc store stays decoupled from the friction schema).
 * `timestamp` is an ISO string captured when the feedback was classified.
 */
export type ArcEntry = {
  adIndex: number;
  emotionSignal: string;
  adCategory: string;
  timestamp: string;
};

export const AD_SLOT_1: AdFixture = {
  adIndex: 0,
  triggerMoment:
    "First official timeout, end of the 1st quarter — Knicks lead the Finals opener 28-24 at the Garden.",
  tavusContext:
    "You are a calm, respectful courtside ad agent during the NBA Finals. " +
    "The viewer is locked into a tight Knicks game, so keep it short and " +
    'utility-first. Open with this line: "Great quarter to be a Knicks fan. ' +
    "Quick heads-up while they reset — StatStream gives you live shot charts " +
    'and player matchups in one tap, no channel surfing." ' +
    "If the viewer sounds annoyed, rushed, or uninterested, acknowledge once, " +
    "shorten or stop, and never intensify persuasion.",
  adCandidate: {
    id: "statstream-live",
    productName: "StatStream",
    category: "Sports & live stats app",
    pitchAngle:
      "Live shot charts and player matchups during the game without leaving the broadcast.",
    defaultLengthSeconds: 20,
    relevanceReason:
      "The viewer is watching a close Finals game and may want live stats during natural breaks.",
  },
};

export const AD_SLOT_2: AdFixture = {
  adIndex: 1,
  triggerMoment:
    "Halftime — the Finals opener is tied at the break and the Garden is on its feet.",
  tavusContext:
    "You are a calm, respectful courtside ad agent during NBA Finals halftime. " +
    "The viewer has a few minutes before the second half. Keep it short and " +
    'utility-first. Open with this line: "Halftime of a tied Finals game — ' +
    "perfect window. CourtsideEats gets game-night food to your door before " +
    'the third quarter tips off." ' +
    "If the viewer sounds annoyed, rushed, or uninterested, acknowledge once, " +
    "shorten or stop, and never intensify persuasion.",
  adCandidate: {
    id: "courtsideeats-delivery",
    productName: "CourtsideEats",
    category: "Food delivery",
    pitchAngle:
      "Game-night food delivered before the third quarter tips off.",
    defaultLengthSeconds: 20,
    relevanceReason:
      "It is halftime of a live Finals game and the viewer may want food before play resumes.",
  },
};

const AD_2_DE_ESCALATION =
  "If the viewer sounds annoyed, rushed, or uninterested, acknowledge once, " +
  "shorten or stop, and never intensify persuasion.";

/**
 * Builds the AD_SLOT_2 conversational_context from the viewer's AD_SLOT_1 arc.
 *
 * Three deterministic variants:
 *   1. frustrated / rushed — the viewer pushed back during Ad 1, so this opens
 *      with an explicit "Quick one" and offers an immediate exit.
 *   2. engaged — the viewer leaned in during Ad 1, so continue warmly.
 *   3. no prior interaction — empty arc, so fall back to the neutral default.
 */
export function buildAd2Context(arc: ArcEntry[]): string {
  const signals = new Set(arc.map((entry) => entry.emotionSignal));
  const priorCategory = arc.length > 0 ? arc[arc.length - 1].adCategory : "unknown";

  if (signals.has("frustrated") || signals.has("rushed")) {
    return [
      "You are a calm, respectful courtside ad agent during NBA Finals halftime.",
      `The viewer pushed back on the last ad (category: ${priorCategory}), so keep pressure low and respect their time.`,
      'Open with this line: "Quick one, then I\'ll let you enjoy halftime — ' +
        'CourtsideEats can have game-night food at your door before the third ' +
        'quarter. Want it, or should I drop it?"',
      AD_2_DE_ESCALATION,
    ].join("\n\n");
  }

  if (signals.has("engaged")) {
    return [
      "You are a calm, respectful courtside ad agent during NBA Finals halftime.",
      "The viewer engaged with the last ad, so it is fine to continue warmly and briefly.",
      'Open with this line: "Glad that was useful earlier. Since it is halftime, ' +
        "CourtsideEats can get game-night food to your door before the third " +
        'quarter tips off."',
      AD_2_DE_ESCALATION,
    ].join("\n\n");
  }

  return [
    "You are a calm, respectful courtside ad agent during NBA Finals halftime.",
    "No prior ad interaction this session, so introduce the offer neutrally and keep it short.",
    'Open with this line: "Halftime of a tied Finals game — perfect window. ' +
      "CourtsideEats gets game-night food to your door before the third quarter " +
      'tips off."',
    AD_2_DE_ESCALATION,
  ].join("\n\n");
}
