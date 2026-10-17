import type { AdCandidate, VideoContext } from "../schemas/context";

export type AdFixture = {
  adIndex: number;
  triggerTimeSeconds: number;
  triggerMoment: string;
  tavusContext: string;
  openingScript: string;
  adCandidate: AdCandidate;
};

export type ArcEntry = {
  adIndex: number;
  emotionSignal: string;
  adCategory: string;
  timestamp: string;
};
export type Ad2ArcTier = "frustrated" | "engaged" | "default";

export const knicksVideoContext: VideoContext = {
  id: "knicks-finals-game2",
  title: "Knicks basketball — recorded demo clip",
  topic: "Basketball broadcast demo",
  tags: ["nba", "knicks", "basketball", "demo"],
  transcriptSnippet: "A recorded basketball clip with two illustrative ad breaks.",
  viewerMode: "focused",
  interruptionRisk: "high",
  recommendedAdStyle: "short_utility",
};

/** Shared grounding policy for every broadcast slot, including follow-up turns. */
export const PRODUCT_ANSWER_RULES = [
  "This is an illustrative demo, not a real store or a live broadcast. Product names are demo labels, not verified retail listings or endorsements.",
  "Answer the viewer's current question directly in one or two short sentences. Use prior turns to resolve follow-up questions; do not restart the opening pitch.",
  "Only use the supplied product facts. Price, sizes, stock, shipping, discounts, purchase links and exact technical specifications are unknown unless explicitly provided. Say you do not know missing facts; never invent an offer or a checkout link.",
  "If the viewer asks about another product or corrects you, acknowledge and clarify briefly. Do not claim to see their screen or know anything beyond the supplied recorded demo context.",
  "If the viewer explicitly says stop, skip, no thanks, enough, or wants to watch the game, stop immediately with no closing sales pitch. Do not add a product name, link or offer. If annoyed, acknowledge once and reduce pressure. Inferred engagement is not permission for a longer pitch.",
].join("\n");

const shoe: AdCandidate = {
  id: "nike-air-zoom-anunoby",
  productName: "Nike Air Zoom Flight",
  category: "basketball_shoe",
  pitchAngle: "An illustrative neon-green basketball shoe concept tied to the on-screen play.",
  defaultLengthSeconds: 30,
  relevanceReason: "A basketball shoe concept during a recorded basketball clip; exact player equipment is not verified.",
};
const jersey: AdCandidate = {
  id: "knicks-finals-jersey",
  productName: "Official Knicks Finals Jersey",
  category: "team_jersey",
  pitchAngle: "An illustrative Knicks team jersey concept for basketball fans.",
  defaultLengthSeconds: 15,
  relevanceReason: "A Knicks jersey concept during the closing moment of the recorded demo clip.",
};

export const AD_SLOT_1: AdFixture = {
  adIndex: 0,
  triggerTimeSeconds: 19,
  triggerMoment: "A basketball play at the 19-second mark of the recorded clip.",
  openingScript: "This demo pairs the basketball play with Nike Air Zoom Flight, an illustrative neon-green shoe concept. I can answer a quick question, or you can skip.",
  tavusContext: [
    PRODUCT_ANSWER_RULES,
    "Demo product: Nike Air Zoom Flight. Category: basketball shoe. Demo color: neon green. Exact player, shoe identification and performance specifications are not verified.",
    "The recorded clip has reached a basketball play at 19 seconds. Wait for the viewer to speak, then introduce the demo concept briefly. If they start with a question, answer it instead of pitching.",
  ].join("\n\n"),
  adCandidate: shoe,
};

export const AD_SLOT_2: AdFixture = {
  adIndex: 1,
  triggerTimeSeconds: 39,
  triggerMoment: "The closing basketball moment at the 39-second mark of the recorded clip.",
  openingScript: "This demo's second concept is the Official Knicks Finals Jersey. It's an illustrative team jersey, with no verified retail offer.",
  tavusContext: "", // built from earlier feedback by buildAd2Context
  adCandidate: jersey,
};

export function classifyAd2Arc(arc: ArcEntry[]): Ad2ArcTier {
  const signals = arc.map((entry) => entry.emotionSignal);
  if (signals.some((signal) => ["frustrated", "annoyed", "disinterested", "rushed"].includes(signal))) return "frustrated";
  if (signals.some((signal) => ["engaged", "interested", "curious"].includes(signal))) return "engaged";
  return "default";
}

export function getAd2DurationSeconds(arc: ArcEntry[]): number {
  switch (classifyAd2Arc(arc)) {
    case "frustrated": return 10;
    case "engaged": return 22;
    default: return 18;
  }
}

export function buildAd2Context(arc: ArcEntry[]): string {
  const tier = classifyAd2Arc(arc);
  return [
    PRODUCT_ANSWER_RULES,
    "Demo product: Official Knicks Finals Jersey. Category: team jersey. Team: New York Knicks. The word Official is part of the illustrative product label, not verified licensing. This is the second ad in the recorded basketball clip.",
    tier === "frustrated"
      ? "The earlier feedback requested less interruption. Keep any introduction to one short sentence. If the viewer pushes back, stop immediately."
      : "Keep the introduction short. Prior positive signals do not authorize a longer pitch; wait for an explicit question or request for more detail.",
    "Answer follow-up questions about this jersey using only the demo facts. If asked about the earlier shoe concept, distinguish the two products and admit unknown details.",
  ].join("\n\n");
}
