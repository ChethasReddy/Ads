import { NextResponse } from "next/server";
import { z } from "zod";
import { AdCandidateSchema, VideoContextSchema } from "@ads/core";
import {
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

  const { sessionId, videoContext, adCandidate, openingScript } = parsed.data;
  const fallbacksEnabled = process.env.ENABLE_PROVIDER_FALLBACKS !== "false";
  const provider = getTavusProvider();

  try {
    const result = await provider.createSession({
      sessionId,
      videoContext,
      adCandidate,
      openingScript,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[/api/tavus/session] provider failed", {
      provider: provider.name,
      message: err instanceof Error ? err.message : "unknown",
    });
    // Demo-critical route: never 500. Degrade to the scripted mock agent so
    // the frontend keeps the Tavus-style experience intact (AGENTS.md §9.1).
    if (fallbacksEnabled) {
      return NextResponse.json(mockResult(sessionId, openingScript), {
        headers: { "x-fallback-used": "true" },
      });
    }
    return NextResponse.json(mockResult(sessionId, openingScript), {
      status: 200,
      headers: { "x-fallback-used": "true" },
    });
  }
}
