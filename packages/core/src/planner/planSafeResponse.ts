import type { AdCandidate, VideoContext } from "../schemas/context";
import type { AgentResponse, FrictionAnalysis } from "../schemas/feedback";
import { SAFE_SCRIPTS } from "../classifier/classifyFeedback";

export interface PlanSafeResponseInput {
  analysis: FrictionAnalysis;
  videoContext: VideoContext;
  adCandidate: AdCandidate;
}

/**
 * Produces an AgentResponse from analysis + context. Pure, deterministic, no
 * network. Negative feedback never escalates pressure: annoyed maps to
 * de_escalate, skip/not_relevant map to stop.
 */
export function planSafeResponse(input: PlanSafeResponseInput): AgentResponse {
  const { analysis, adCandidate } = input;
  const product = `${adCandidate.productName}: ${adCandidate.pitchAngle}`;

  if (analysis.intent === "skip") {
    return {
      strategy: "stop",
      script: SAFE_SCRIPTS.skip,
      shouldContinue: false,
      shouldStop: true,
      safetyStatus: "allowed",
    };
  }

  if (analysis.intent === "stop") {
    return {
      strategy: "stop",
      script: SAFE_SCRIPTS.not_relevant,
      shouldContinue: false,
      shouldStop: true,
      safetyStatus: "allowed",
    };
  }

  if (analysis.intent === "continue") {
    return {
      strategy: "continue",
      script: `${product} What would you like to know?`,
      shouldContinue: true,
      shouldStop: false,
      safetyStatus: "allowed",
    };
  }

  if (analysis.intent === "compress") {
    if (analysis.emotionSignal === "frustrated") {
      return {
        strategy: "de_escalate",
        script: SAFE_SCRIPTS.annoyed,
        shouldContinue: false,
        shouldStop: false,
        safetyStatus: "allowed",
      };
    }
    if (analysis.frictionLevel === "medium") {
      return {
        strategy: "shorten",
      script: `One line: ${product}`,
        shouldContinue: true,
        shouldStop: false,
        safetyStatus: "allowed",
      };
    }
    return {
      strategy: "shorten",
      script: `Useful part only: ${product}`,
      shouldContinue: true,
      shouldStop: false,
      safetyStatus: "allowed",
    };
  }

  if (analysis.intent === "clarify") {
    return {
      strategy: "clarify",
      script: `Quick clarification: ${product}`,
      shouldContinue: true,
      shouldStop: false,
      safetyStatus: "allowed",
    };
  }

  return {
    strategy: "shorten",
    script: "Let me keep this brief.",
    shouldContinue: false,
    shouldStop: false,
    safetyStatus: "allowed",
  };
}
