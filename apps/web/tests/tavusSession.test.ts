import { beforeEach, describe, expect, it, vi } from "vitest";
import { AD_SLOT_1, AD_SLOT_2, knicksVideoContext, demoAdCandidate } from "@ads/core";
const createSession = vi.hoisted(() => vi.fn());
vi.mock("@ads/integrations", () => ({
  getTavusProvider: () => ({ name: "mock", createSession }),
  getArcEntries: async () => [],
  TAVUS_MOCK_URL_PREFIX: "tavus-mock://session/",
}));
import { POST } from "../app/api/tavus/session/route";

beforeEach(() => {
  createSession.mockReset().mockImplementation(async (input) => ({
    provider: "mock", sessionId: input.sessionId, fallbackAgentScript: input.openingScript, status: "fallback_ready",
  }));
});
const request = (adIndex?: number) => new Request("http://localhost/api/tavus/session", {
  method: "POST", body: JSON.stringify({ sessionId: "test", adIndex,
    videoContext: knicksVideoContext, adCandidate: demoAdCandidate, openingScript: "Client opening" }),
});
describe("broadcast session route", () => {
  it.each([AD_SLOT_1, AD_SLOT_2])("owns product facts for slot $adIndex", async (slot) => {
    const response = await POST(request(slot.adIndex));
    expect(response.status).toBe(200);
    expect(createSession.mock.calls[0][0].adCandidate).toEqual(slot.adCandidate);
    expect((await response.json()).fallbackAgentScript).toBe(slot.openingScript);
  });
  it("retains the generic no-slot caller", async () => {
    await POST(request());
    expect(createSession.mock.calls[0][0].adCandidate).toEqual(demoAdCandidate);
    expect(createSession.mock.calls[0][0].openingScript).toBe("Client opening");
  });
  it("rejects unrecognized slots", async () => {
    expect((await POST(request(7))).status).toBe(400);
  });
});
