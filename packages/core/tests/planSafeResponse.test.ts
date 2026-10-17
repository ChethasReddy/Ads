import { describe, expect, it } from "vitest";
import { classifyFeedback } from "../src/classifier/classifyFeedback";
import { planSafeResponse } from "../src/planner/planSafeResponse";
import { AD_SLOT_1, AD_SLOT_2, demoAdCandidate, demoVideoContext } from "../src/fixtures";
import type { ViewerFeedback } from "../src/schemas/feedback";

function feedbackFor(
  signal: ViewerFeedback["buttonSignal"],
): ViewerFeedback {
  return {
    id: `f-${signal}`,
    sessionId: "s1",
    buttonSignal: signal,
    timestamp: "2026-06-06T00:00:00.000Z",
  };
}

describe("planSafeResponse", () => {
  describe.each([AD_SLOT_1, AD_SLOT_2])("active product $adCandidate.productName", ({ adCandidate }) => {
    it.each(["too_long", "tell_me_quickly", "interested"] as const)(
      "%s talks about this product without inventing an offer",
      (signal) => {
        const response = planSafeResponse({
          analysis: classifyFeedback(feedbackFor(signal)),
          videoContext: demoVideoContext,
          adCandidate,
        });
        expect(response.script).toContain(adCandidate.productName);
        expect(response.script).not.toMatch(/demo[- ](?:ready )?screens|rough ideas?|paste your idea|mockups/i);
        expect(response.script).not.toMatch(/\d+%|\$\d|free shipping|ship fast|sell out|july 4|4th of july/i);
        expect(response.shouldStop).toBe(false);
        expect(response.safetyStatus).toBe("allowed");
      },
    );

    it("clarification stays about the active product", () => {
      const response = planSafeResponse({
        analysis: { ...classifyFeedback(feedbackFor("tell_me_quickly")), intent: "clarify", recommendedAction: "clarify" },
        videoContext: demoVideoContext,
        adCandidate,
      });
      expect(response.script).toContain(adCandidate.productName);
      expect(response.script).not.toMatch(/demo screens|rough idea/i);
    });

    it.each(["skip", "not_relevant"] as const)("%s stops without a last product pitch", (signal) => {
      const response = planSafeResponse({
        analysis: classifyFeedback(feedbackFor(signal)), videoContext: demoVideoContext, adCandidate,
      });
      expect(response).toMatchObject({ strategy: "stop", shouldStop: true, shouldContinue: false });
      expect(response.script).not.toContain(adCandidate.productName);
      expect(response.script).not.toMatch(/https?:|\.com|\d+%|buy|grab|offer/i);
    });
  });

  it("retains relevant utility for the original startup fixture", () => {
    const response = planSafeResponse({
      analysis: classifyFeedback(feedbackFor("tell_me_quickly")),
      videoContext: demoVideoContext,
      adCandidate: demoAdCandidate,
    });
    expect(response.script).toMatch(/demo[- ](?:ready )?screens|mockups/i);
    expect(response.script).not.toMatch(/nike|jersey|shipping/i);
  });

  it("annoyed never returns strategy 'continue'", () => {
    const analysis = classifyFeedback(feedbackFor("annoyed"));
    const response = planSafeResponse({
      analysis,
      videoContext: demoVideoContext,
      adCandidate: demoAdCandidate,
    });
    expect(response.strategy).not.toBe("continue");
  });

  it("skip always returns shouldStop true", () => {
    const analysis = classifyFeedback(feedbackFor("skip"));
    const response = planSafeResponse({
      analysis,
      videoContext: demoVideoContext,
      adCandidate: demoAdCandidate,
    });
    expect(response.shouldStop).toBe(true);
  });
});
