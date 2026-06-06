import {
  TAVUS_MOCK_URL_PREFIX,
  type TavusProvider,
  type TavusSessionInput,
  type TavusSessionResult,
} from "./types";

/**
 * Synthetic Tavus session for offline/demo-mode. The conversation_url uses
 * the literal "tavus-mock://session/" prefix so the frontend can detect mock
 * sessions and render its scripted fallback agent card instead of an iframe.
 */
export class MockTavusProvider implements TavusProvider {
  readonly name = "mock" as const;

  async createSession(
    input: TavusSessionInput,
  ): Promise<TavusSessionResult> {
    return {
      provider: "mock",
      sessionId: input.sessionId,
      tavusConversationUrl: `${TAVUS_MOCK_URL_PREFIX}${input.sessionId}`,
      tavusConversationId: `mock-${input.sessionId}`,
      fallbackAgentScript: input.openingScript,
      status: "fallback_ready",
    };
  }

  async endSession(_sessionId: string): Promise<void> {
    // no-op
  }
}
