import { NextResponse } from "next/server";
import type { MemoryUpdate, PreferenceMemory } from "@ads/core";
import {
  getAgentMemoryProvider,
  getPreferences,
  isRedisIrisConfigured,
} from "@ads/integrations";
import { apiError, getSessionId } from "../_lib/http";

interface MemoryGetResponse {
  sessionId: string;
  preferences: PreferenceMemory[];
  currentMode: MemoryUpdate["currentMode"];
  provider: "redis_iris" | "memory" | "local_demo";
}

interface MemoryDeleteResponse {
  sessionId: string;
  cleared: true;
}

export async function GET(request: Request): Promise<NextResponse> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return apiError("VALIDATION_ERROR", "sessionId query param is required.", 400);
  }

  const provider = getAgentMemoryProvider();
  const fallbacksEnabled =
    process.env.ENABLE_PROVIDER_FALLBACKS !== "false";

  try {
    const [preferences, currentMode] = await Promise.all([
      getPreferences(sessionId),
      provider.getSessionMode(sessionId),
    ]);
    const body: MemoryGetResponse = {
      sessionId,
      preferences,
      currentMode,
      provider: isRedisIrisConfigured() ? "redis_iris" : "memory",
    };
    return NextResponse.json(body);
  } catch (err) {
    console.warn("[/api/memory GET] provider read failed", {
      provider: provider.name,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (!fallbacksEnabled) {
      return apiError("PROVIDER_UNAVAILABLE", "Memory provider unavailable.", 503);
    }
    const body: MemoryGetResponse = {
      sessionId,
      preferences: [],
      currentMode: "normal",
      provider: "memory",
    };
    return NextResponse.json(body, { headers: { "x-fallback-used": "true" } });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return apiError("VALIDATION_ERROR", "sessionId query param is required.", 400);
  }

  const provider = getAgentMemoryProvider();
  const fallbacksEnabled =
    process.env.ENABLE_PROVIDER_FALLBACKS !== "false";

  try {
    await provider.clear(sessionId);
  } catch (err) {
    console.warn("[/api/memory DELETE] provider clear failed", {
      provider: provider.name,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (!fallbacksEnabled) {
      return apiError("PROVIDER_UNAVAILABLE", "Memory provider unavailable.", 503);
    }
  }

  const body: MemoryDeleteResponse = { sessionId, cleared: true };
  return NextResponse.json(body);
}
