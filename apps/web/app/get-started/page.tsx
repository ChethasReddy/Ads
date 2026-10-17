"use client";

import { AD_SLOT_1, AD_SLOT_2, AgentResponseSchema, classifyFeedback, planSafeResponse, knicksVideoContext, type AdFixture, type ButtonSignal } from "@ads/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TavusAgentPanel, type TavusAgentHandle } from "../../components/tavus/TavusAgentPanel";
import { postJson, TavusSessionSchema, type TavusSessionResponse, type FeedbackSource } from "../../lib/tavus";
import { TavusConversation } from "../../lib/state/tavusConversation";

const AD_SLOTS = [AD_SLOT_1, AD_SLOT_2];
const FEEDBACK_BUTTONS = [
  { signal: "too_long", label: "Too long" }, { signal: "not_relevant", label: "Not relevant" },
  { signal: "annoyed", label: "I'm annoyed" }, { signal: "tell_me_quickly", label: "Tell me quickly" },
  { signal: "interested", label: "I'm interested" }, { signal: "skip", label: "Skip this" },
] as const;
type ActiveAd = { id: number; slot: AdFixture; session: TavusSessionResponse; lifecycle: TavusConversation };
type AdRun = { id: number; slot: AdFixture; abort: AbortController; lifecycle: TavusConversation };
function formatTime(value: number) {
  const time = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${Math.floor(time / 60).toString().padStart(2, "0")}:${Math.floor(time % 60).toString().padStart(2, "0")}`;
}

export default function GetStartedPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<TavusAgentHandle>(null);
  const firedRef = useRef(new Set<number>());
  const currentRun = useRef<AdRun | null>(null);
  const generation = useRef(0);
  const pendingNegativeWrites = useRef(0);
  const memoryUncertain = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [activeAd, setActiveAd] = useState<ActiveAd | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const markers = useMemo(() => AD_SLOTS.map(slot => ({ label: `Ad ${slot.adIndex + 1}`, time: slot.triggerTimeSeconds,
    triggerMoment: slot.triggerMoment, left: `${slot.triggerTimeSeconds / duration * 100}%` })), [duration]);

  const dismissAd = useCallback(() => currentRun.current?.lifecycle.stop(), []);

  const sendFeedback = useCallback((signal: ButtonSignal, source: FeedbackSource = "button") => {
    // Inference is not consent to a longer current or future advertisement.
    if (source === "perception" && signal === "interested") return;
    const run = currentRun.current;
    if (!run || run.lifecycle.ended) return;
    panelRef.current?.clearPending();
    const requestId = run.lifecycle.request();
    const sessionId = sessionRef.current;
    const negative = signal !== "interested";
    if (negative) pendingNegativeWrites.current++;
    const feedback = { id: crypto.randomUUID(), sessionId, buttonSignal: signal, timestamp: new Date().toISOString() };
    if (signal === "skip" || signal === "not_relevant") run.lifecycle.stop();
    else {
      if (signal === "interested") run.lifecycle.engage(source);
      else panelRef.current?.interrupt();
      setFeedbackStatus("Applying feedback…");
    }
    // Preserve persistence order without ever waiting to stop local media.
    writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
      let response;
      let stored = true;
      try {
        const data = await postJson("/api/feedback", { sessionId, feedback, videoContext: knicksVideoContext,
          adCandidate: run.slot.adCandidate, adCategory: run.slot.adCandidate.category });
        response = AgentResponseSchema.parse((data as { agentResponse?: unknown }).agentResponse);
      } catch {
        stored = false;
        response = planSafeResponse({ analysis: classifyFeedback(feedback), videoContext: knicksVideoContext, adCandidate: run.slot.adCandidate });
      } finally {
        if (negative && sessionRef.current === sessionId) pendingNegativeWrites.current--;
      }
      if (!stored && negative && sessionRef.current === sessionId) memoryUncertain.current = true;
      if (currentRun.current !== run || !run.lifecycle.accept(requestId)) return;
      setFeedbackStatus(`${response.script}${stored ? "" : " Demo response active; memory was not confirmed."}`);
      if (response.shouldStop) { run.lifecycle.stop(); return; }
      panelRef.current?.respond({ id: requestId, script: response.script, signal, source });
      if (negative) run.lifecycle.shorten();
    });
  }, []);

  const triggerAd = useCallback(async (slot: AdFixture) => {
    if (currentRun.current || pendingNegativeWrites.current > 0 || memoryUncertain.current) return;
    sessionRef.current ||= `demo-${crypto.randomUUID()}`;
    videoRef.current?.pause();
    setAdLoading(true);
    setFeedbackStatus(null);
    const run: AdRun = {
      id: ++generation.current, slot, abort: new AbortController(),
      lifecycle: new TavusConversation(() => {
        if (currentRun.current !== run) return;
        currentRun.current = null;
        setActiveAd(null); setAdLoading(false); setFeedbackStatus(null);
        void videoRef.current?.play().catch(() => {});
      }, () => {
        run.abort.abort();
        if (currentRun.current === run) panelRef.current?.stop();
      }),
    };
    currentRun.current = run;
    run.lifecycle.start(slot.adCandidate.defaultLengthSeconds);
    let session: TavusSessionResponse;
    try {
      session = TavusSessionSchema.parse(await postJson("/api/tavus/session", {
        sessionId: sessionRef.current, videoContext: knicksVideoContext, adCandidate: slot.adCandidate,
        openingScript: slot.openingScript, adIndex: slot.adIndex,
      }, run.abort.signal));
    } catch {
      session = { provider: "mock", sessionId: sessionRef.current, fallbackAgentScript: slot.openingScript, status: "fallback_ready" };
    }
    if (currentRun.current !== run || run.lifecycle.ended) return;
    // Use the arc-aware short budget returned by the server.
    run.lifecycle.start(session.adDurationSeconds ?? slot.adCandidate.defaultLengthSeconds);
    setActiveAd({ id: run.id, slot, session, lifecycle: run.lifecycle });
    setAdLoading(false);
    if (session.provider === "mock") run.lifecycle.live();
  }, []);

  useEffect(() => () => {
    currentRun.current?.lifecycle.dispose();
    currentRun.current = null;
  }, []);

  function syncTime() {
    if (!videoRef.current) {
      return;
    }

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    for (const slot of AD_SLOTS) {
      if (
        time >= slot.triggerTimeSeconds &&
        !firedRef.current.has(slot.adIndex) &&
        !currentRun.current &&
        pendingNegativeWrites.current === 0
      ) {
        firedRef.current.add(slot.adIndex);
        if (!memoryUncertain.current) void triggerAd(slot);
        break;
      }
    }
  }

  function syncDuration() {
    if (!videoRef.current || !Number.isFinite(videoRef.current.duration)) {
      return;
    }

    setDuration(videoRef.current.duration);
  }

  function handleTimelineChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextTime = Number(event.target.value);

    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function jumpTo(time: number) {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function startSession() {
    currentRun.current?.lifecycle.dispose();
    currentRun.current = null;
    sessionRef.current = `demo-${crypto.randomUUID()}`;
    pendingNegativeWrites.current = 0;
    memoryUncertain.current = false;
    writeQueue.current = Promise.resolve();
    firedRef.current.clear();
    setActiveAd(null); setAdLoading(false); setFeedbackStatus(null);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
    setCurrentTime(0);
  }
  const fallbackScript = activeAd?.session.fallbackAgentScript ?? activeAd?.slot.openingScript ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1b1b1b] px-4 py-6 text-[#fff8d6]">
      <section className="w-full max-w-5xl border-2 border-[#f3e8a6] bg-[#1b1b1b] p-3 font-mono shadow-[10px_10px_0px_0px_#000]">
        <div className="border-2 border-[#f3e8a6]">
          <div className="flex items-center justify-between gap-4 border-b-2 border-[#f3e8a6] px-3 py-3 text-sm sm:text-lg">
            <div className="flex items-center gap-2">
              <span>MomentSense Ads</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <span>Memory: On</span>
              <button
                type="button"
                className="border-l-2 border-[#f3e8a6] pl-3 text-[#fff8d6] transition-colors duration-150 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid min-h-[18rem] grid-cols-1 border-b-2 border-[#f3e8a6] md:grid-cols-[1.65fr_1fr]">
            <div className="border-b-2 border-[#f3e8a6] px-5 py-6 md:border-b-0 md:border-r-2 md:border-[#f3e8a6]">
              <div className="flex h-full flex-col gap-4">
                <p className="text-lg sm:text-2xl">Video Player</p>
                <div className="relative flex-1 overflow-hidden border-2 border-[#f3e8a6] bg-black">
                  <video
                    ref={videoRef}
                    src="/Knicks-Video.mp4"
                    className="h-full min-h-[13rem] w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    onTimeUpdate={syncTime}
                    onLoadedMetadata={syncDuration}
                  />

                  {(activeAd || adLoading) && (
                    <div className="absolute inset-0 flex items-end justify-end bg-black/50 p-3 sm:p-4">
                      <div className="flex max-h-[85%] w-full max-w-md flex-col border-2 border-[#7bdff6] bg-[#1b1b1b] p-3 shadow-[6px_6px_0px_0px_#000] sm:max-w-lg">
                        {adLoading ? (
                          <div><p className="text-sm text-[#7bdff6]">Starting Tavus agent…</p>
                            <button type="button" onClick={() => sendFeedback("skip")} className="mt-3 border px-3 py-2">Skip this</button>
                          </div>
                        ) : (
                          activeAd && (
                            <>
                              <TavusAgentPanel
                                key={activeAd.id}
                                ref={panelRef}
                                conversationId={activeAd.session.tavusConversationId}
                                conversationUrl={
                                  activeAd.session.tavusConversationUrl ?? ""
                                }
                                meetingToken={activeAd.session.meetingToken}
                                provider={activeAd.session.provider}
                                fallbackScript={fallbackScript}
                                productName={
                                  activeAd.slot.adCandidate.productName
                                }
                                triggerMoment={activeAd.slot.triggerMoment}
                                onFeedback={sendFeedback}
                                onConversationEnd={dismissAd}
                                onAgentLive={() => activeAd.lifecycle.live()}
                                onQuestion={() => {
                                  activeAd.lifecycle.request();
                                  activeAd.lifecycle.engage("question");
                                }}
                              />

                              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f3e8a6]/30 pt-3">
                                {FEEDBACK_BUTTONS.map(({ signal, label }) => (
                                  <button
                                    key={signal}
                                    type="button"
                                    onClick={() => sendFeedback(signal)}
                                    className="border border-[#f3e8a6]/60 px-2 py-1 text-[10px] uppercase tracking-wide transition-colors hover:bg-[#f3e8a6] hover:text-black sm:text-xs"
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>

                              {feedbackStatus && (
                                <p className="mt-2 text-xs leading-relaxed text-[#86efac]">
                                  {feedbackStatus}
                                </p>
                              )}

                              <button
                                type="button"
                                onClick={() => sendFeedback("skip")}
                                className="mt-3 w-full border border-[#f3e8a6] px-2 py-1 text-xs transition-colors hover:bg-[#f3e8a6] hover:text-black"
                              >
                                Dismiss &amp; resume game
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="flex flex-col justify-start px-3 py-4 text-lg sm:px-4 sm:text-2xl">
              <div className="space-y-3 border-l-2 border-[#7bdff6] pl-3">
                <p>Context Intelligence</p>
                <p>Preference Memory</p>
                <p>Next Ad Strategy</p>
              </div>
            </aside>
          </div>

          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <div className="flex flex-col gap-4 text-sm sm:text-lg">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <span>{`Timeline: ${formatTime(currentTime)}`}</span>
                <div className="relative min-w-[12rem] flex-1">
                  <div className="pointer-events-none absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[#f3e8a6]" />
                  {markers.map((marker) => (
                    <button
                      key={marker.label}
                      type="button"
                      aria-label={`Jump to ${marker.label} at ${formatTime(marker.time)}`}
                      title={marker.triggerMoment}
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#fff8d6] bg-white"
                      style={{ left: marker.left }}
                      onClick={() => jumpTo(marker.time)}
                    />
                  ))}
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={Math.min(currentTime, duration)}
                    onChange={handleTimelineChange}
                    className="relative h-4 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#1b1b1b] [&::-moz-range-thumb]:bg-[#ff6b6b] [&::-moz-range-track]:h-[2px] [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-[#ff6b6b]"
                  />
                </div>
                <span>{formatTime(duration)}</span>
                <span className="ml-auto hidden text-[#ff7a7a] sm:inline">|</span>
              </div>

              <div className="relative h-8">
                {markers.map((marker) => (
                  <button
                    key={`${marker.label}-label`}
                    type="button"
                    className="absolute top-0 -translate-x-1/2 transition-colors duration-150 hover:text-white"
                    style={{ left: marker.left }}
                    onClick={() => jumpTo(marker.time)}
                  >
                    {`${marker.label} (${formatTime(marker.time)})`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 font-sans text-xs font-black uppercase tracking-[0.18em] text-white sm:text-sm">
          <Link href="/" className="hover:text-[#ffd93d]">
            Back
          </Link>
          <button
            type="button"
            onClick={startSession}
            className="border-2 border-[#f3e8a6] bg-[#ff6b6b] px-4 py-2 text-black transition-transform duration-150 hover:-translate-y-0.5"
          >
            Start Session
          </button>
        </div>
      </section>
    </main>
  );
}
