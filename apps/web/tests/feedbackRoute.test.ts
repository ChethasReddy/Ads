import { beforeEach, describe, expect, it, vi } from "vitest";
import { AD_SLOT_1, knicksVideoContext } from "@ads/core";
const memory = vi.hoisted(() => ({
  appendFeedback: vi.fn(), setSessionMode: vi.fn(), storeArcEntry: vi.fn(), getArcEntries: vi.fn(), storePreference: vi.fn(),
}));
vi.mock("@ads/integrations", () => ({
  getAgentMemoryProvider: () => ({ name: "memory", appendFeedback: memory.appendFeedback, setSessionMode: memory.setSessionMode }),
  storeArcEntry: memory.storeArcEntry, getArcEntries: memory.getArcEntries, storePreference: memory.storePreference,
}));
import { POST } from "../app/api/feedback/route";
const request = () => new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify({
  sessionId: "test", feedback: { id: "f1", sessionId: "test", buttonSignal: "skip", timestamp: "2026-10-17T12:00:00Z" },
  videoContext: knicksVideoContext, adCandidate: AD_SLOT_1.adCandidate,
}) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENABLE_PROVIDER_FALLBACKS", "true");
  memory.getArcEntries.mockImplementation(async () => [memory.storeArcEntry.mock.calls.at(-1)?.[1]]);
});
describe("feedback persistence confirmation", () => {
  it("confirms history through the same reader used by the next ad", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(memory.getArcEntries).toHaveBeenCalledWith("test");
    expect(response.headers.get("x-fallback-used")).toBeNull();
  });
  it("marks a silent write/read mismatch as unconfirmed while preserving the stop response", async () => {
    memory.getArcEntries.mockResolvedValue([{ adIndex: 0, emotionSignal: "engaged", adCategory: "old", timestamp: "old" }]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-fallback-used")).toBe("true");
    expect((await response.json()).agentResponse.shouldStop).toBe(true);
  });
});
