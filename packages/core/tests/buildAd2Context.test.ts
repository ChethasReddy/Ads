import { describe, expect, it } from "vitest";
import {
  buildAd2Context,
  classifyAd2Arc,
  getAd2DurationSeconds,
  type ArcEntry,
  AD_SLOT_1,
  AD_SLOT_2,
} from "../src/fixtures/knicksGame";

function arc(emotionSignal: string): ArcEntry[] {
  return [
    {
      adIndex: 0,
      emotionSignal,
      adCategory: "basketball_shoe",
      timestamp: new Date().toISOString(),
    },
  ];
}

describe("classifyAd2Arc", () => {
  it("maps annoyed/frustrated to frustrated tier", () => {
    expect(classifyAd2Arc(arc("frustrated"))).toBe("frustrated");
    expect(classifyAd2Arc(arc("annoyed"))).toBe("frustrated");
  });

  it("maps skip/disinterested to frustrated tier", () => {
    expect(classifyAd2Arc(arc("disinterested"))).toBe("frustrated");
  });

  it("maps rushed to frustrated tier (short ad)", () => {
    expect(classifyAd2Arc(arc("rushed"))).toBe("frustrated");
  });

  it("maps engaged and interested to engaged tier", () => {
    expect(classifyAd2Arc(arc("engaged"))).toBe("engaged");
    expect(classifyAd2Arc(arc("interested"))).toBe("engaged");
    expect(classifyAd2Arc(arc("curious"))).toBe("engaged");
  });

  it("returns default with no arc", () => {
    expect(classifyAd2Arc([])).toBe("default");
    expect(classifyAd2Arc(arc("neutral"))).toBe("default");
  });
});

describe("buildAd2Context", () => {
  // The former exact-copy checks pinned pressure and a made-up storefront.
  // Assert the product/safety contract so truthful wording can evolve.
  it.each(["frustrated", "rushed", "engaged", "neutral"])(
    "%s context keeps jersey facts and removes fabricated offers",
    (signal) => {
      const context = buildAd2Context(arc(signal));
      expect(context).toMatch(/Knicks.*jersey/i);
      expect(context).toMatch(/demo|illustrative/i);
      expect(context).not.toMatch(/before they sell out|they ship fast|last one, I promise|knicksjersey\.com/i);
      expect(context).not.toMatch(/\d+% off|free shipping|\$\d/i);
    },
  );

  it.each(["frustrated", "rushed"])("%s feedback retains the short, low-pressure path", (signal) => {
    expect(buildAd2Context(arc(signal))).toMatch(/brief|short|one (?:line|sentence)|8.second/i);
    expect(getAd2DurationSeconds(arc(signal))).toBeLessThan(getAd2DurationSeconds([]));
  });
});

describe("broadcast product grounding", () => {
  const contexts = [
    ["shoes", AD_SLOT_1.tavusContext],
    ["jersey default", buildAd2Context([])],
    ["jersey interested", buildAd2Context(arc("engaged"))],
    ["jersey rejected", buildAd2Context(arc("frustrated"))],
  ];

  it.each(contexts)("%s admits missing facts and supports concise follow-up questions", (_name, context) => {
    expect(context).toMatch(/demo|illustrative/i);
    expect(context).toMatch(/question|follow.up/i);
    expect(context).toMatch(/unknown|not (?:provided|known|available)|do not know|don't know|missing/i);
    for (const fact of ["price", "stock", "shipping"]) expect(context.toLowerCase()).toContain(fact);
    expect(context).not.toMatch(/15%|free shipping over|before they sell out|they ship fast|sale runs through/i);
  });

  it.each(contexts)("%s stop instructions contain no closing sales pitch", (_name, context) => {
    expect(context).toMatch(/stop|skip/i);
    expect(context).toMatch(/immediate|no (?:further|more|closing|final)|without.*pitch/i);
    expect(context).not.toMatch(/Fair\s*[—-]\s*(?:Nike|Finals jersey)|say ONLY[^.]*\.com/i);
  });

  it.each([AD_SLOT_1, AD_SLOT_2])("slot $adIndex candidate does not reintroduce fabricated offers", ({ adCandidate }) => {
    expect(adCandidate.pitchAngle).not.toMatch(/15%|4th of July|through July|knicksjersey\.com|free shipping|sell out/i);
  });
});

describe("getAd2DurationSeconds", () => {
  it("returns tier-appropriate fallback durations", () => {
    expect(getAd2DurationSeconds(arc("frustrated"))).toBe(10);
    expect(getAd2DurationSeconds(arc("engaged"))).toBe(22);
    expect(getAd2DurationSeconds([])).toBe(18);
  });
});
