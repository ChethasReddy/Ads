import { MockTavusProvider } from "./mockProvider";
import { RealTavusProvider } from "./realProvider";
import type { TavusProvider } from "./types";

export type {
  TavusProvider,
  TavusSessionInput,
  TavusSessionResult,
} from "./types";
export {
  TAVUS_AUDIO_TOOLS,
  TAVUS_AUDIO_TOOL_PROMPT,
  TAVUS_PERSONA_PERCEPTION_LAYER,
  TAVUS_MOCK_URL_PREFIX,
} from "./types";
export { MockTavusProvider } from "./mockProvider";
export { RealTavusProvider, buildPersonaPayload } from "./realProvider";

let cached: TavusProvider | undefined;

function defaultTimeoutMs(): number {
  const raw = process.env.PROVIDER_TIMEOUT_MS;
  if (!raw) return 8000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
}

/**
 * Returns RealTavusProvider when every Tavus env var is set AND
 * NEXT_PUBLIC_TAVUS_ENABLED === "true". Otherwise MockTavusProvider.
 */
export function getTavusProvider(): TavusProvider {
  if (cached) return cached;

  const apiKey = process.env.TAVUS_API_KEY;
  const replicaId = process.env.TAVUS_REPLICA_ID;
  const personaId = process.env.TAVUS_PERSONA_ID;
  const enabled = process.env.NEXT_PUBLIC_TAVUS_ENABLED === "true";

  if (enabled && apiKey && replicaId && personaId) {
    try {
      cached = new RealTavusProvider({
        apiKey,
        replicaId,
        personaId,
        timeoutMs: defaultTimeoutMs(),
      });
      return cached;
    } catch {
      // fall through
    }
  }

  cached = new MockTavusProvider();
  return cached;
}

/** Test-only: forget the cached singleton. */
export function _resetTavusProvider(): void {
  cached = undefined;
}
