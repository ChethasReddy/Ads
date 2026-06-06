import type { ArcEntry, PreferenceMemory } from "@ads/core";
import * as inMemory from "./inMemoryProvider";
import * as iris from "./redisIrisProvider";

export function isRedisIrisConfigured(): boolean {
  return (
    process.env.NEXT_PUBLIC_REDIS_ENABLED === "true" &&
    Boolean(process.env.REDIS_IRIS_SERVER_URL) &&
    Boolean(process.env.REDIS_IRIS_STORE_ID) &&
    Boolean(process.env.REDIS_IRIS_API_KEY)
  );
}

export async function storeArcEntry(
  sessionId: string,
  entry: ArcEntry,
): Promise<void> {
  if (isRedisIrisConfigured()) {
    try {
      await iris.storeArcEntry(sessionId, entry);
      return;
    } catch {
      // fall through to in-memory so the demo never hard-fails
    }
  }
  return inMemory.storeArcEntry(sessionId, entry);
}

export async function getArcEntries(sessionId: string): Promise<ArcEntry[]> {
  if (isRedisIrisConfigured()) {
    const entries = await iris.getArcEntries(sessionId);
    if (entries.length > 0) return entries;
  }
  return inMemory.getArcEntries(sessionId);
}

export async function storePreference(
  sessionId: string,
  pref: PreferenceMemory,
): Promise<void> {
  if (isRedisIrisConfigured()) {
    try {
      await iris.storePreference(sessionId, pref);
      return;
    } catch {
      // fall through to in-memory
    }
  }
  return inMemory.storePreference(sessionId, pref);
}

export async function getPreferences(
  sessionId: string,
): Promise<PreferenceMemory[]> {
  if (isRedisIrisConfigured()) {
    const prefs = await iris.getPreferences(sessionId);
    if (prefs.length > 0) return prefs;
  }
  return inMemory.getPreferences(sessionId);
}
