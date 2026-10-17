import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AD_SLOT_1,
  AD_SLOT_2,
  knicksVideoContext,
  AdCandidateSchema,
  VideoContextSchema,
  buildAd2Context,
  getAd2DurationSeconds,
} from "@ads/core";
import {
  getArcEntries,
  getTavusProvider,
  TAVUS_MOCK_URL_PREFIX,
  type TavusSessionResult,
} from "@ads/integrations";
import { parseJson } from "../../_lib/http";

const TavusSessionRequestSchema = z.object({
  sessionId: z.string().min(1),
  videoContext: VideoContextSchema,
  adCandidate: AdCandidateSchema,
  openingScript: z.string().min(1),
  adIndex: z.union([z.literal(0), z.literal(1)]).optional(),
  tavusContext: z.string().optional(),
});

/**
 * Builds the deterministic mock session result. Used both when the provider is
 * the mock and as the fallback when a real Tavus call fails. The frontend
 * detects the TAVUS_MOCK_URL_PREFIX and renders its scripted agent card.
 */
function mockResult(
  sessionId: string,
  openingScript: string,
): TavusSessionResult {
  return {
    provider: "mock",
    sessionId,
    tavusConversationUrl: `${TAVUS_MOCK_URL_PREFIX}${sessionId}`,
    tavusConversationId: `mock-${sessionId}`,
    fallbackAgentScript: openingScript,
    status: "fallback_ready",
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await parseJson(request, TavusSessionRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { sessionId, videoContext, adCandidate, openingScript, adIndex } =
    parsed.data;
  const provider = getTavusProvider();

  // Resolve the conversational_context for the two-slot broadcast. AD_SLOT_2
  // (adIndex 1) is arc-aware: it reads the viewer's AD_SLOT_1 interactions and
  // adapts the pitch. Both slot paths override any passed openingScript /
  // tavusContext. When adIndex is absent we keep the legacy openingScript path.
  const slot = adIndex === 0 ? AD_SLOT_1 : adIndex === 1 ? AD_SLOT_2 : undefined;
  const effectiveScript = slot?.openingScript ?? openingScript;
  let conversationalContext = slot?.tavusContext;
  let adDurationSeconds: number | undefined;
  try {
    if (adIndex === 1) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arc = await Promise.race([
        getArcEntries(sessionId),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Memory deadline")), 2000); }),
      ]).finally(() => clearTimeout(timer));
      conversationalContext = buildAd2Context(arc);
      adDurationSeconds = getAd2DurationSeconds(arc);
    } else if (slot) {
      adDurationSeconds = slot.adCandidate.defaultLengthSeconds;
    }
    const result = await provider.createSession({
      sessionId,
      videoContext: slot ? knicksVideoContext : videoContext,
      adCandidate: slot?.adCandidate ?? adCandidate,
      openingScript: effectiveScript,
      conversationalContext,
    });
    return NextResponse.json({ ...result, adDurationSeconds });
  } catch (err) {
    console.warn("[/api/tavus/session] provider failed", {
      provider: provider.name,
      message: err instanceof Error ? err.message : "unknown",
    });
    // Demo-critical route: never 500. Degrade to the scripted mock agent so
    // the frontend keeps the Tavus-style experience intact (AGENTS.md §9.1).
    return NextResponse.json(
      { ...mockResult(sessionId, effectiveScript), adDurationSeconds },
      {
        status: 200,
        headers: { "x-fallback-used": "true" },
      },
    );
  }
}
