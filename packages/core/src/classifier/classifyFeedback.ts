import type {
  ButtonSignal,
  FrictionAnalysis,
  ViewerFeedback,
} from "../schemas/feedback";

/**
 * Deterministic mapping from button signal to friction analysis.
 * Source of truth: AGENTS.md §10. voiceText is intentionally ignored in this
 * build — Tavus Raven-1 handles emotion perception. Its tool calls arrive in
 * the browser via Daily.js and are mapped to a buttonSignal before reaching
 * this function through /api/feedback.
 */
const SIGNAL_MAP: Record<ButtonSignal, FrictionAnalysis> = {
  too_long: {
    emotionSignal: "rushed",
    frictionLevel: "medium",
    intent: "compress",
    adRisk: "too_long",
    recommendedAction: "shorten",
    confidence: "high",
  },
  not_relevant: {
    emotionSignal: "disinterested",
    frictionLevel: "high",
    intent: "stop",
    adRisk: "low_relevance",
    recommendedAction: "stop",
    confidence: "high",
  },
  annoyed: {
    emotionSignal: "frustrated",
    frictionLevel: "high",
    intent: "compress",
    adRisk: "interruption_fatigue",
    recommendedAction: "lower_frequency",
    confidence: "high",
  },
  tell_me_quickly: {
    emotionSignal: "rushed",
    frictionLevel: "low",
    intent: "compress",
    adRisk: "too_long",
    recommendedAction: "shorten",
    confidence: "medium",
  },
  interested: {
    emotionSignal: "engaged",
    frictionLevel: "none",
    intent: "continue",
    adRisk: "none",
    recommendedAction: "continue",
    confidence: "high",
  },
  skip: {
    emotionSignal: "disinterested",
    frictionLevel: "high",
    intent: "skip",
    adRisk: "hard_rejection",
    recommendedAction: "stop",
    confidence: "high",
  },
};

const UNKNOWN_ANALYSIS: FrictionAnalysis = {
  emotionSignal: "neutral",
  frictionLevel: "none",
  intent: "unknown",
  adRisk: "none",
  recommendedAction: "continue",
  confidence: "low",
};

export function classifyFeedback(feedback: ViewerFeedback): FrictionAnalysis {
  if (feedback.buttonSignal) {
    return { ...SIGNAL_MAP[feedback.buttonSignal] };
  }
  return { ...UNKNOWN_ANALYSIS };
}

export const SAFE_SCRIPTS: Record<ButtonSignal, string> = {
  too_long:
    "You're right. One line: this helps turn rough ideas into clean demo screens fast.",
  not_relevant:
    "Thanks for the signal. I'll avoid this type of ad next time.",
  annoyed: "Fair. I'll keep this short and stop after one line.",
  tell_me_quickly:
    "Got it. Useful part only: it generates polished demo screens from a rough idea.",
  interested:
    "Great. The fastest path is to paste your idea and generate three demo-ready screens.",
  skip: "No problem. I'll stop here.",
};
