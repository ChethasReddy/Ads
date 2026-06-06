import { AgentMemory } from "@redis-iris/agent-memory";
import type { ArcEntry, PreferenceMemory } from "@ads/core";

let _client: AgentMemory | null = null;

function getClient(): AgentMemory {
  if (!_client) {
    _client = new AgentMemory({
      serverURL: process.env.REDIS_IRIS_SERVER_URL!,
      storeId: process.env.REDIS_IRIS_STORE_ID!,
      apiKey: process.env.REDIS_IRIS_API_KEY!,
    });
  }
  return _client;
}

const ARC_PATTERN = /Ad (\d+) \(([^)]+)\): viewer was (\w+)/;

export async function storeArcEntry(
  sessionId: string,
  entry: ArcEntry,
): Promise<void> {
  await getClient().addSessionEvent({
    sessionId,
    actorId: sessionId,
    role: "USER",
    content: [
      {
        text: `Ad ${entry.adIndex} (${entry.adCategory}): viewer was ${entry.emotionSignal}`,
      },
    ],
    createdAt: new Date(),
  });
}

export async function getArcEntries(sessionId: string): Promise<ArcEntry[]> {
  try {
    const session = await getClient().getSessionMemory(sessionId);
    const events: unknown[] =
      (session as any)?.events ?? (session as any)?.messages ?? [];
    return events.flatMap((e: any) => {
      const text = e?.content?.[0]?.text ?? e?.text ?? "";
      const match = ARC_PATTERN.exec(text);
      if (!match) return [];
      return [
        {
          adIndex: parseInt(match[1], 10),
          adCategory: match[2],
          emotionSignal: match[3],
          timestamp: new Date(e.createdAt ?? Date.now()).toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function storePreference(
  sessionId: string,
  pref: PreferenceMemory,
): Promise<void> {
  await getClient().bulkCreateLongTermMemories({
    memories: [
      {
        id: `pref-${sessionId}-${pref.preferenceId}`,
        text: `${pref.label} [session:${sessionId}]`,
      },
    ],
  });
}

export async function getPreferences(
  sessionId: string,
): Promise<PreferenceMemory[]> {
  try {
    const results = await getClient().searchLongTermMemory({
      text: `ad preference session ${sessionId}`,
    });
    const memories: unknown[] =
      (results as any)?.memories ?? (results as any)?.results ?? [];
    return memories
      .filter((m: any) => {
        const text: string = m?.text ?? "";
        return text.includes(`[session:${sessionId}]`);
      })
      .map((m: any) => ({
        preferenceId: String(m.id ?? crypto.randomUUID()),
        label: String(m.text ?? "").replace(/ \[session:[^\]]+\]/, ""),
        sourceSignal: "raven-1",
        confidence: "medium" as const,
        scope: "session" as const,
        viewerVisible: true,
        safetyStatus: "allowed" as const,
      }));
  } catch {
    return [];
  }
}

/** Test-only: forget the cached Redis Iris client. */
export function _resetRedisIrisClient(): void {
  _client = null;
}
