import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AdCandidateSchema,
  VideoContextSchema,
  ViewerFeedbackSchema,
  classifyFeedback,
  createMemoryUpdate,
  planSafeResponse,
  validateSafety,
  type AgentResponse,
  type FrictionAnalysis,
  type MemoryUpdate,
} from "@ads/core";
import {
  getAgentMemoryProvider,
  storeArcEntry,
  storePreference,
} from "@ads/integrations";
import { apiError, parseJson } from "../_lib/http";

const FeedbackRequestSchema = z.object({
  sessionId: z.string().min(1),
  feedback: ViewerFeedbackSchema,
  videoContext: VideoContextSchema,
  adCandidate: AdCandidateSchema,
  adCategory: z.string().optional(),
});

interface FeedbackResponse {
  analysis: FrictionAnalysis;
  agentResponse: AgentResponse;
  memoryUpdate: MemoryUpdate;
}


export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await parseJson(request, FeedbackRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { sessionId, feedback, videoContext, adCandidate, adCategory } =
    parsed.data;

  const analysis = classifyFeedback(feedback);
  const candidateResponse = planSafeResponse({
    analysis,
    videoContext,
    adCandidate,
  });
  const candidateMemory = createMemoryUpdate({
    sessionId,
    feedback,
    analysis,
  });
  const safety = validateSafety({
    response: candidateResponse,
    memoryUpdate: candidateMemory,
  });

  const agentResponse = safety.modifiedResponse ?? candidateResponse;
  const blockedIds = new Set(safety.blockedLabels.map((p) => p.preferenceId));
  const memoryUpdate: MemoryUpdate = {
    ...candidateMemory,
    allowedPreferences: candidateMemory.allowedPreferences.filter(
      (p) => !blockedIds.has(p.preferenceId),
    ),
    blockedUnsafeLabels: [
      ...candidateMemory.blockedUnsafeLabels,
      ...safety.blockedLabels,
    ],
  };

  const provider = getAgentMemoryProvider();
  const fallbacksEnabled =
    process.env.ENABLE_PROVIDER_FALLBACKS !== "false";
  let providerFailed = false;

  try {
    await provider.appendFeedback(sessionId, feedback);
    await provider.setSessionMode(sessionId, memoryUpdate.currentMode);

    await storeArcEntry(sessionId, {
      adIndex: 0,
      emotionSignal: analysis.emotionSignal,
      adCategory: adCategory ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    for (const pref of memoryUpdate.allowedPreferences) {
      await storePreference(sessionId, pref);
    }
  } catch (err) {
    providerFailed = true;
    console.warn("[/api/feedback] provider write failed", {
      provider: provider.name,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (!fallbacksEnabled) {
      return apiError(
        "PROVIDER_UNAVAILABLE",
        "Memory provider unavailable.",
        503,
        false,
      );
    }
  }

  const body: FeedbackResponse = { analysis, agentResponse, memoryUpdate };
  return NextResponse.json(body, {
    status: 200,
    headers: providerFailed ? { "x-fallback-used": "true" } : undefined,
  });
}
