import type { AdCandidate, VideoContext } from "../schemas/context";
import type { ViewerFeedback } from "../schemas/feedback";

export * from "./knicksGame";

export const demoVideoContext: VideoContext = {
  id: "startup-demo-24h",
  title: "How to build a startup demo in 24 hours",
  topic: "Startup demo building",
  tags: ["startup", "hackathon", "demo", "product design", "builder workflow"],
  transcriptSnippet:
    "In this tutorial, we turn a rough product idea into a polished startup demo with clear screens, pitch flow, and launch-ready storytelling.",
  viewerMode: "focused",
  interruptionRisk: "high",
  recommendedAdStyle: "short_utility",
};

export const demoAdCandidate: AdCandidate = {
  id: "demo-screen-builder",
  productName: "LaunchFrame AI",
  category: "Developer or design tool",
  pitchAngle: "Create polished demo screens from a rough product idea.",
  defaultLengthSeconds: 20,
  relevanceReason:
    "The viewer is watching a hackathon or startup demo-building video and may need fast demo assets.",
};

export const annoyedFeedback: ViewerFeedback = {
  id: "feedback-annoyed-001",
  sessionId: "demo-session-001",
  buttonSignal: "annoyed",
  voiceText: "Bro, I'm trying to watch the video. This is annoying.",
  timestamp: "2026-06-06T00:00:00.000Z",
};
