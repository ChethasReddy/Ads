// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyFeedback, planSafeResponse, AD_SLOT_1, knicksVideoContext } from "@ads/core";
import Page from "../app/get-started/page";

const daily = vi.hoisted(() => ({ calls: [] as FakeCall[], ready: true }));
type Listener = (event?: { data?: unknown }) => void;
type FakeCall = {
  on: (name: string, cb: Listener) => void;
  emit: (name: string, data?: unknown) => void;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  sendAppMessage: ReturnType<typeof vi.fn>;
  participants: () => Record<string, unknown>;
};
vi.mock("@daily-co/daily-js", () => ({ default: { createCallObject: () => {
  const handlers = new Map<string, Listener[]>();
  const call: FakeCall = {
    on: (name, cb) => { handlers.set(name, [...(handlers.get(name) ?? []), cb]); },
    emit: (name, data) => { for (const cb of handlers.get(name) ?? []) cb({ data }); },
    join: vi.fn().mockImplementation(async () => { call.emit("joined-meeting"); }),
    leave: vi.fn().mockImplementation(() => new Promise<void>(() => {})),
    destroy: vi.fn().mockResolvedValue(undefined),
    sendAppMessage: vi.fn(),
    participants: () => daily.ready ? ({ remote: { local: false, tracks: {
      audio: { state: "playable", persistentTrack: {} }, video: { state: "playable", persistentTrack: {} },
    } } }) : {},
  };
  daily.calls.push(call);
  return call;
} } }));

let root: Root;
let host: HTMLDivElement;
let feedbackRequests: Record<string, unknown>[];
let resolveFeedback: ((response: Response) => void) | undefined;
const session = { provider: "tavus", status: "ready", sessionId: "test", tavusConversationId: "call-1", tavusConversationUrl: "https://example.daily.co/room", adDurationSeconds: 10 };
const json = (data: unknown) => new Response(JSON.stringify(data));
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(node => node.textContent?.trim() === label);
  expect(button, label).toBeTruthy();
  await act(async () => { button!.click(); await tick(); });
}
async function start() {
  const video = host.querySelector("video")!;
  await act(async () => { video.currentTime = 19; video.dispatchEvent(new Event("timeupdate", { bubbles: true })); await tick(); });
  await act(tick);
}
function event(name: string, properties: unknown, seq = 1) {
  return { message_type: "conversation", event_type: name, conversation_id: "call-1", seq, properties };
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("MediaStream", class {});
  daily.calls = [];
  daily.ready = true;
  window.__tavusDailyCallObject = null;
  feedbackRequests = [];
  resolveFeedback = undefined;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
    if (path.includes("/tavus/session")) return json(session);
    feedbackRequests.push(JSON.parse(options.body as string));
    return new Promise<Response>(resolve => { resolveFeedback = resolve; });
  }));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Page />));
});
afterEach(async () => {
  await act(async () => { root.unmount(); await vi.runAllTimersAsync(); });
  host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("real page and panel feedback wiring", () => {
  it("keeps the new live call working after Strict Mode cleans up its first mount", async () => {
    await act(async () => root.render(<StrictMode><Page /></StrictMode>));
    await start();
    expect(daily.calls).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(daily.calls[0].destroy).toHaveBeenCalled();
    expect(daily.calls[1].destroy).not.toHaveBeenCalled();
    expect(host.querySelector("audio")!.muted).toBe(false);
    await click("Skip this");
    expect(host.textContent).not.toContain("Tavus live");
  });

  it("holds feedback during connection and delivers it once when the replica is ready", async () => {
    daily.ready = false;
    await start();
    const call = daily.calls.at(-1)!;
    await click("Tell me quickly");
    await act(async () => {
      resolveFeedback!(json({ agentResponse: { strategy: "shorten", script: "One useful detail.", shouldContinue: true, shouldStop: false, safetyStatus: "allowed" } }));
      await tick();
    });
    expect(call.sendAppMessage).not.toHaveBeenCalled();
    await act(async () => {
      daily.ready = true;
      call.emit("participant-updated");
      call.emit("participant-updated");
    });
    expect(call.sendAppMessage.mock.calls.filter(([message]) => message.event_type === "conversation.echo")).toHaveLength(1);
  });

  it("sends the approved answer to Daily and Skip silences before pending leave resolves", async () => {
    await start();
    const call = daily.calls.at(-1)!;
    expect(call).toBeTruthy();
    await click("Tell me quickly");
    const response = planSafeResponse({ analysis: classifyFeedback({ id: "f", sessionId: "s", timestamp: "now", buttonSignal: "tell_me_quickly" }), adCandidate: AD_SLOT_1.adCandidate, videoContext: knicksVideoContext });
    await act(async () => { resolveFeedback!(json({ agentResponse: response })); await tick(); });
    expect(call.sendAppMessage.mock.calls.some(([message]) => message.event_type === "conversation.echo" && message.properties.text === response.script)).toBe(true);
    const audio = host.querySelector("audio")!;
    expect(audio.muted).toBe(false);
    await click("Skip this");
    expect(audio.muted).toBe(true);
    expect(audio.srcObject).toBeNull();
    expect(host.textContent).not.toContain("Tavus live");
    expect(host.querySelector("video")!.play).toHaveBeenCalled();
    expect(call.leave).toHaveBeenCalled();
    expect(call.destroy).not.toHaveBeenCalled(); // cleanup is still pending
  });

  it("ignores duplicate/wrong-conversation perception events and sends no raw transcript", async () => {
    await start();
    const call = daily.calls.at(-1)!;
    const message = event("conversation.perception_tool_call", { name: "mark_rushed" });
    await act(async () => {
      call.emit("app-message", { ...message, conversation_id: "old-call" });
      call.emit("app-message", message); call.emit("app-message", message); await tick();
    });
    expect(feedbackRequests).toHaveLength(1);
    expect(feedbackRequests[0].feedback).not.toHaveProperty("voiceText");
  });

  it("keeps two explicit questions open until the fixed cap and ignores old speech-end closure", async () => {
    await start();
    const call = daily.calls.at(-1)!;
    await act(async () => {
      call.emit("app-message", event("conversation.utterance", { role: "user", speech: "What sizes?" }));
      call.emit("app-message", event("conversation.replica.stopped_speaking", { duration: 10, interrupted: false }));
      await vi.advanceTimersByTimeAsync(25_000);
      call.emit("app-message", event("conversation.utterance", { role: "user", speech: "And the price?" }, 2));
      await vi.advanceTimersByTimeAsync(64_999);
    });
    expect(host.textContent).toContain("Tavus live");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(host.textContent).not.toContain("Tavus live");
  });

  it("does not let a late feedback answer restart an ad after Skip", async () => {
    await start();
    const call = daily.calls.at(-1)!;
    await click("Too long");
    const previous = resolveFeedback!;
    await click("Skip this");
    await act(async () => { previous(json({ agentResponse: { strategy: "shorten", script: "Old answer", shouldContinue: true, shouldStop: false, safetyStatus: "allowed" } })); await tick(); });
    expect(call.sendAppMessage.mock.calls.some(([message]) => message.event_type === "conversation.echo")).toBe(false);
    expect(host.textContent).not.toContain("Old answer");
  });

  it("offers immediate Skip before a session request resolves", async () => {
    let finishSession: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finishSession = resolve; }));
    await start();
    expect(host.textContent).toContain("Starting Tavus agent");
    await click("Skip this");
    expect(host.textContent).not.toContain("Starting Tavus agent");
    await act(async () => { finishSession!(json(session)); await tick(); });
    expect(daily.calls).toHaveLength(0);
  });

  it("inferred engagement never extends the ordinary ad budget", async () => {
    await start();
    await act(async () => {
      daily.calls.at(-1)!.emit("app-message", event("conversation.perception_tool_call", { name: "mark_engaged" }));
      await vi.advanceTimersByTimeAsync(18_000);
    });
    expect(host.textContent).not.toContain("Tavus live");
  });

  it("keeps fallback buttons usable after a live connection fails", async () => {
    await start();
    await act(async () => daily.calls.at(-1)!.emit("error"));
    expect(host.textContent).toContain("Demo fallback active");
    await click("Too long");
    await act(async () => {
      resolveFeedback!(json({ agentResponse: { strategy: "shorten", script: "Brief demo answer", shouldContinue: true, shouldStop: false, safetyStatus: "allowed" } }));
      await tick();
    });
    expect(host.textContent).toContain("Brief demo answer");
    await click("Skip this");
    expect(host.textContent).not.toContain("Demo fallback active");
  });

  it("suppresses the next automatic ad when a Skip write is pending or fails", async () => {
    await start();
    await click("Skip this");
    const video = host.querySelector("video")!;
    await act(async () => { video.currentTime = 39; video.dispatchEvent(new Event("timeupdate")); await tick(); });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes("/tavus/session"))).toHaveLength(1);
    await act(async () => { resolveFeedback!(new Response("offline", { status: 503 })); await tick(); });
    await act(async () => { video.dispatchEvent(new Event("timeupdate")); await tick(); });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes("/tavus/session"))).toHaveLength(1);
  });
});
