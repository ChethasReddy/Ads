import { afterEach, describe, expect, it, vi } from "vitest";
import { TavusConversation } from "../lib/state/tavusConversation";

afterEach(() => vi.useRealTimers());

describe("live conversation lifecycle", () => {
  it("preserves a shortening deadline when the replica becomes live", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const call = new TavusConversation(close, vi.fn());
    call.start(30);
    call.shorten();
    vi.advanceTimersByTime(2000);
    call.live();
    vi.advanceTimersByTime(6000);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops local audio and resumes before any asynchronous cleanup can finish", () => {
    const events: string[] = [];
    const call = new TavusConversation(() => events.push("resume"), () => {
      events.push("silence");
      return new Promise<void>(() => {});
    });
    call.start(30);
    const pendingReply = call.request();
    call.stop();
    expect(events).toEqual(["silence", "resume"]);
    expect(call.accept(pendingReply)).toBe(false);
    call.stop();
    expect(events).toHaveLength(2);
  });

  it("keeps inferred engagement short but allows explicit follow-ups until the fixed cap", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const call = new TavusConversation(close, vi.fn());
    call.start(10);
    call.live();
    call.engage("perception");
    vi.advanceTimersByTime(18_000);
    expect(close).toHaveBeenCalledTimes(1);

    const followupClose = vi.fn();
    const followup = new TavusConversation(followupClose, vi.fn());
    followup.start(10);
    followup.live();
    followup.engage("question");
    vi.advanceTimersByTime(30_000);
    followup.engage("question");
    vi.advanceTimersByTime(59_999);
    expect(followupClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(followupClose).toHaveBeenCalledTimes(1);
  });

  it("discards an older reply and cancels engagement when shortening", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const call = new TavusConversation(close, vi.fn());
    call.start(30);
    call.live();
    call.engage("button");
    const old = call.request();
    const latest = call.request();
    expect(call.accept(old)).toBe(false);
    expect(call.accept(latest)).toBe(true);
    call.shorten();
    vi.advanceTimersByTime(8_000);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("dispose invalidates callbacks without resuming a page that unmounted", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const silence = vi.fn();
    const call = new TavusConversation(close, silence);
    call.start(5);
    call.dispose();
    vi.runAllTimers();
    expect(close).not.toHaveBeenCalled();
    expect(silence).toHaveBeenCalledTimes(1);
  });
});
