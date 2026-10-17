import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoAdCandidate, demoVideoContext } from "../../core/src/fixtures";
import { MockTavusProvider } from "../src/tavus/mockProvider";
import { RealTavusProvider } from "../src/tavus/realProvider";
import type { TavusSessionInput } from "../src/tavus/types";

const input: TavusSessionInput = {
  sessionId: "test-session",
  videoContext: demoVideoContext,
  adCandidate: demoAdCandidate,
  openingScript: "LaunchFrame AI turns rough ideas into demo screens.",
  conversationalContext: "INTERNAL POLICY: Answer only supplied facts. Stop immediately on rejection.",
};
const timeoutMs = 100;
const provider = () => new RealTavusProvider({
  apiKey: "test-key", replicaId: "test-replica", personaId: "test-persona", timeoutMs,
});

// Model fetch's actual cancellation contract: both waiting for headers and
// reading an unfinished body reject when the request's AbortSignal fires.
function untilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RealTavusProvider deadline", () => {
  it.each(["headers", "body"] as const)("aborts a stalled %s read within the same session deadline", async (phase) => {
    let requestSignal: AbortSignal | undefined;
    const readBody = vi.fn();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal;
      if (phase === "headers") return untilAbort(requestSignal);
      readBody.mockImplementation(() => untilAbort(requestSignal!));
      return Promise.resolve({ ok: true, json: readBody } as unknown as Response);
    }));

    let outcome = "pending";
    const settled = provider().createSession(input).then(
      () => { outcome = "resolved"; },
      () => { outcome = "rejected"; },
    );
    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(outcome).toBe("pending");
    if (phase === "body") expect(readBody).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    // Assert settlement instead of awaiting a never-resolving buggy provider.
    // A premature clearTimeout must fail immediately, not hang the test runner.
    expect(requestSignal?.aborted).toBe(true);
    expect(outcome).toBe("rejected");
    await settled;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns decoded session metadata and clears the timer after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      conversation_id: "conversation-1", conversation_url: "https://example.daily.co/test", meeting_token: "test-token",
    })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().createSession(input)).resolves.toMatchObject({
      provider: "tavus", status: "ready", sessionId: input.sessionId,
      tavusConversationId: "conversation-1", tavusConversationUrl: "https://example.daily.co/test", meetingToken: "test-token",
    });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string).conversational_context).toBe(input.conversationalContext);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["HTTP failure", () => new Response("unavailable", { status: 503 })],
    ["invalid JSON", () => new Response("not-json")],
    ["missing conversation metadata", () => new Response(JSON.stringify({ status: "ready" }))],
  ] as const)("rejects %s so the session route can select its fallback", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    await expect(provider().createSession(input)).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("MockTavusProvider spoken fallback", () => {
  it.each([input.conversationalContext, undefined])("returns only openingScript with context %s", async (conversationalContext) => {
    const result = await new MockTavusProvider().createSession({ ...input, conversationalContext });
    expect(result).toMatchObject({ provider: "mock", status: "fallback_ready", sessionId: input.sessionId });
    expect(result.fallbackAgentScript).toBe(input.openingScript);
  });
});
