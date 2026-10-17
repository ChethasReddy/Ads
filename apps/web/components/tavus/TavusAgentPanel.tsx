"use client";

import type { DailyCall } from "@daily-co/daily-js";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { attachParticipantMedia, destroyDailyCall, getDailyCall, getReplicaParticipant } from "../../lib/dailyCallSingleton";
import { classifyViewerSpeech, feedbackMessages, isMockTavusUrl, parseTavusEvent, type FeedbackCommand, type FeedbackSource } from "../../lib/tavus";
import type { ButtonSignal } from "@ads/core";

export type TavusAgentHandle = { stop: () => void; interrupt: () => void; respond: (command: FeedbackCommand) => void };
type Props = {
  ref?: Ref<TavusAgentHandle>;
  conversationUrl: string;
  conversationId?: string;
  meetingToken?: string;
  provider: "tavus" | "mock";
  fallbackScript: string;
  productName: string;
  triggerMoment: string;
  onFeedback: (signal: ButtonSignal, source: FeedbackSource) => void;
  onConversationEnd: () => void;
  onAgentLive: () => void;
  onQuestion: () => void;
};

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void; stop: () => void;
};

export function TavusAgentPanel(props: Props) {
  const { conversationUrl, conversationId, meetingToken, provider, fallbackScript, productName, triggerMoment, ref } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const callbacks = useRef(props);
  const ended = useRef(false);
  const failed = useRef(false);
  const readyRef = useRef(false);
  const pendingCommand = useRef<FeedbackCommand | null>(null);
  const lastCommand = useRef(-1);
  const recognitionRef = useRef<Recognition | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "fallback">("connecting");
  const [displayScript, setDisplayScript] = useState(fallbackScript);
  const [voiceNote, setVoiceNote] = useState("");
  const useLive = provider === "tavus" && !isMockTavusUrl(conversationUrl);

  useEffect(() => { callbacks.current = props; });

  const detachMedia = useCallback(() => {
    for (const media of [audioRef.current, videoRef.current]) {
      if (media) { media.muted = true; media.pause(); media.srcObject = null; }
    }
  }, []);
  function stop() {
    if (ended.current) return;
    ended.current = true;
    pendingCommand.current = null;
    detachMedia();
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    const call = callRef.current;
    callRef.current = null;
    if (call) void destroyDailyCall(call);
  }
  function interrupt() {
    if (!ended.current && readyRef.current && callRef.current && conversationId) {
      try { callRef.current.sendAppMessage({ message_type: "conversation", event_type: "conversation.interrupt", conversation_id: conversationId }, "*"); }
      catch { /* UI can still show the approved answer */ }
    }
  }
  const deliver = useCallback((command: FeedbackCommand) => {
      const call = callRef.current;
      if (!call || !conversationId) return;
      try {
        const messages = feedbackMessages(conversationId, command.script, command.signal);
        for (const message of messages) {
          // Inferred interest must not start an unsolicited new pitch.
          if (command.source === "perception" && command.signal === "interested" && message.event_type !== "conversation.append_llm_context") continue;
          call.sendAppMessage(message, "*");
        }
      } catch {
        failed.current = true;
        detachMedia();
        callRef.current = null;
        void destroyDailyCall(call);
        setStatus("fallback");
      }
  }, [conversationId, detachMedia]);
  useImperativeHandle(ref, () => ({
    stop, interrupt,
    respond(command) {
      if (ended.current || command.id <= lastCommand.current) return;
      lastCommand.current = command.id;
      setDisplayScript(command.script);
      if (!readyRef.current) { pendingCommand.current = command; return; }
      deliver(command);
    },
  }));

  useEffect(() => {
    if (!useLive) return;
    let cancelled = false;
    let ownCall: DailyCall | null = null;
    let ready = false;
    ended.current = false;
    failed.current = false;
    readyRef.current = false;
    const seen = new Set<string>();
    const recent = new Map<string, number>();
    const fallback = () => {
      if (cancelled || ended.current) return;
      failed.current = true;
      detachMedia();
      const call = ownCall;
      ownCall = null;
      callRef.current = null;
      if (call) void destroyDailyCall(call);
      setStatus("fallback");
    };
    const joinDeadline = setTimeout(fallback, 20_000);
    const handleSpeech = (text: string) => {
      const intent = classifyViewerSpeech(text);
      if (intent === "question") callbacks.current.onQuestion();
      else if (intent) callbacks.current.onFeedback(intent, "speech");
    };
    const syncMedia = () => {
      if (cancelled || ended.current || failed.current || !ownCall) return;
      const replica = getReplicaParticipant(ownCall.participants());
      if (!replica) return;
      if (audioRef.current) audioRef.current.muted = false;
      if (attachParticipantMedia(replica, videoRef.current, audioRef.current) && !ready) {
        ready = true;
        readyRef.current = true;
        clearTimeout(joinDeadline);
        setStatus("live");
        callbacks.current.onAgentLive();
        const pending = pendingCommand.current;
        pendingCommand.current = null;
        if (pending) deliver(pending);
      }
    };
    try {
      ownCall = getDailyCall();
      const call = ownCall;
      callRef.current = call;
      call.on("joined-meeting", syncMedia);
      call.on("participant-joined", syncMedia);
      call.on("participant-updated", syncMedia);
      call.on("track-started", syncMedia);
      call.on("error", fallback);
      call.on("camera-error", () => setVoiceNote("Microphone unavailable. Use the feedback buttons."));
      call.on("left-meeting", () => {
        if (!cancelled && !ended.current && !failed.current && ownCall === call) callbacks.current.onConversationEnd();
      });
      call.on("app-message", (event) => {
        if (cancelled || ended.current || failed.current || ownCall !== call || !conversationId) return;
        const parsed = parseTavusEvent(event.data, conversationId);
        if (!parsed) return;
        if (parsed.kind === "utterance" && (!parsed.final || parsed.role !== "user")) return;
        const data = event.data as { seq?: unknown; turn_idx?: unknown };
        const semantic = parsed.kind === "feedback" ? `feedback:${parsed.signal}` : `user:${parsed.text}`;
        const key = typeof data.turn_idx === "number" ? `${data.turn_idx}:${semantic}`
          : typeof data.seq === "number" ? `${data.seq}:${semantic}` : null;
        if (key && seen.has(key)) return;
        if (!key && Date.now() - (recent.get(semantic) ?? 0) < 1500) return;
        if (key) seen.add(key);
        recent.set(semantic, Date.now());
        if (parsed.kind === "feedback") callbacks.current.onFeedback(parsed.signal, parsed.source);
        else handleSpeech(parsed.text);
      });
      void call.join({ url: conversationUrl, ...(meetingToken ? { token: meetingToken } : {}), userName: "Viewer", startVideoOff: true, startAudioOff: false })
        .then(() => {
          if (cancelled || ended.current || ownCall !== call) { void destroyDailyCall(call); return; }
          syncMedia();
        }).catch(fallback);
    } catch { fallback(); }

    // Supplement Tavus transcripts with explicit final stop commands only.
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (Ctor) {
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
      recognition.onresult = (event) => {
        if (cancelled || ended.current) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && classifyViewerSpeech(result[0].transcript) === "skip") callbacks.current.onFeedback("skip", "speech");
        }
      };
      recognition.onerror = () => setVoiceNote("Browser speech unavailable. Use buttons or speak directly to Tavus.");
      queueMicrotask(() => {
        if (cancelled || ended.current) return;
        try { recognition.start(); } catch { setVoiceNote("Browser speech unavailable. Use the feedback buttons."); }
      });
    } else queueMicrotask(() => {
      if (!cancelled) setVoiceNote("Voice input not supported in this browser. Use buttons.");
    });

    return () => {
      cancelled = true;
      clearTimeout(joinDeadline);
      detachMedia();
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
      if (ownCall) void destroyDailyCall(ownCall);
      if (callRef.current === ownCall) callRef.current = null;
    };
  }, [useLive, conversationUrl, conversationId, meetingToken, deliver, detachMedia]);

  const fallback = !useLive || status === "fallback";
  return (
    <div className="flex h-full min-h-[10rem] flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="text-[#7bdff6]">{productName}</span>
        <span>{fallback ? "Demo fallback active" : status === "live" ? "Tavus live" : "Connecting…"}</span>
      </div>
      <p className="mb-2 text-xs text-[#fff8d6]/80">{triggerMoment} · Illustrative demo</p>
      {fallback ? <p className="max-h-40 overflow-y-auto text-sm" aria-live="polite">{displayScript}</p> : (
        <div className="relative min-h-[10rem] bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="h-40 w-full object-cover" />
          <audio ref={audioRef} autoPlay playsInline />
          {status !== "live" && <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm">Connecting to Tavus. You can skip at any time.</p>}
        </div>
      )}
      {voiceNote && <p className="mt-2 text-xs">{voiceNote}</p>}
    </div>
  );
}
