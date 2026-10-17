import { describe, expect, it } from "vitest";
import { classifyViewerSpeech, feedbackMessages, parseTavusEvent } from "../lib/tavus";

const conversationId = "c-test-active";
// Redacted Daily app-message.data envelopes, not pre-mapped button signals.
// https://docs.tavus.io/sections/event-schemas/conversation-perception-tool-call
// https://docs.tavus.io/sections/event-schemas/conversation-utterance-streaming
function event(event_type: string, properties: unknown) {
  return { message_type: "conversation", event_type, conversation_id: conversationId,
    timestamp: 1746000000.123, seq: 42, turn_idx: 3, properties };
}

const perception = event("conversation.perception_tool_call", {
  name: "mark_high_friction", modality: "audio", arguments: { reason: "redacted" },
});

describe("parseTavusEvent", () => {
  it.each([
    ["mark_high_friction", "annoyed"],
    ["mark_engaged", "interested"],
    ["mark_rushed", "tell_me_quickly"],
  ])("reads nested properties.name for %s and preserves inferred origin", (name, signal) => {
    expect(parseTavusEvent(event("conversation.perception_tool_call", {
      name, modality: "audio", arguments: { reason: "redacted" },
    }), conversationId)).toEqual({ kind: "feedback", signal, source: "perception" });
  });

  it.each([
    ["null", null], ["string", "invalid json"], ["array", []], ["empty", {}],
    ["wrong conversation", { ...perception, conversation_id: "c-previous" }],
    ["missing conversation", { ...perception, conversation_id: undefined }],
    ["wrong message type", { ...perception, message_type: "system" }],
    ["unknown event", { ...perception, event_type: "conversation.unknown" }],
    ["LLM tool is not perception", { ...perception, event_type: "conversation.tool_call" }],
    ["flat tool shortcut", { ...perception, properties: undefined, tool_name: "mark_high_friction" }],
    ["unknown tool", event("conversation.perception_tool_call", { name: "unapproved_tool" })],
    ["prototype property", event("conversation.perception_tool_call", { name: "constructor" })],
    ["malformed properties", { ...perception, properties: null }],
    ["non-string tool", event("conversation.perception_tool_call", { name: 42 })],
    ["invalid role", event("conversation.utterance", { role: "system", speech: "stop" })],
    ["empty speech", event("conversation.utterance", { role: "user", speech: "  " })],
    ["non-string speech", event("conversation.utterance", { role: "user", speech: 42 })],
    ["lookalike event", event("conversation.utterance.unrecognized", { role: "user", speech: "stop" })],
  ])("ignores %s", (_label, data) => {
    expect(parseTavusEvent(data, conversationId)).toBeNull();
  });

  it.each(["user", "replica"])("normalizes a completed %s utterance", (role) => {
    expect(parseTavusEvent(event("conversation.utterance", { role, speech: "No thanks." }), conversationId))
      .toEqual({ kind: "utterance", role, text: "No thanks.", final: true });
  });

  it.each([false, true])("preserves streaming final=%s without turning a partial into a stop", (final) => {
    expect(parseTavusEvent(event("conversation.utterance.streaming", {
      role: "user", speech: "Don't stop", final,
    }), conversationId)).toEqual({ kind: "utterance", role: "user", text: "Don't stop", final });
  });

  it("does not treat the string 'true' as a final utterance", () => {
    const parsed = parseTavusEvent(event("conversation.utterance.streaming", {
      role: "user", speech: "stop", final: "true",
    }), conversationId);
    expect(parsed === null || (parsed.kind === "utterance" && parsed.final === false)).toBe(true);
  });
});

describe("classifyViewerSpeech", () => {
  it.each(["Stop.", "Skip this", "No thanks", "Not now", "Enough", "Please stop the ad", "Can you stop the ad?"])(
    "recognizes an explicit stop: %s", (text) => expect(classifyViewerSpeech(text)).toBe("skip"),
  );
  it.each(["Don't stop", "Do not stop", "Don't skip this", "I can't stop watching", "The bus stop is nearby", "", "hello"])(
    "does not stop for negation or incidental words: %s", (text) => expect(classifyViewerSpeech(text)).toBeNull(),
  );
  it.each(["Does shipping stop on weekends?", "What does it cost?", "And what sizes are available?", "Where can I buy the jersey?"])(
    "keeps product follow-ups as questions: %s", (text) => expect(classifyViewerSpeech(text)).toBe("question"),
  );
  it.each([
    ["Too long", "too_long"], ["Not relevant", "not_relevant"],
    ["This is annoying", "annoyed"], ["Tell me quickly", "tell_me_quickly"],
    ["I'm interested", "interested"],
  ])("normalizes explicit feedback: %s", (text, signal) => expect(classifyViewerSpeech(text)).toBe(signal));
});

describe("feedbackMessages", () => {
  // Protocol properties: conversation-interrupt, conversation-append-context,
  // and conversation-echo under https://docs.tavus.io/sections/event-schemas/.
  // Pin safe outbound copy here: no raw transcript or inferred emotional label.
  it.each([
    ["too_long", "The viewer prefers a shorter ad. Keep the answer to one sentence and do not restart the pitch."],
    ["tell_me_quickly", "The viewer prefers a direct utility summary. Keep the answer to one sentence and do not restart the pitch."],
    ["annoyed", "Reduce interruption and pressure. Acknowledge once, keep it brief, and do not continue persuasion."],
    ["interested", "Answer concise product follow-up questions using only supplied facts. Do not restart the pitch or invent offers."],
  ] as const)("%s interrupts, updates safe context, then echoes exactly the approved script", (signal, context) => {
    const script = "Nike Air Zoom Flight is the basketball shoe in this illustrative demo.";
    expect(feedbackMessages(conversationId, script, signal)).toEqual([
      { message_type: "conversation", event_type: "conversation.interrupt", conversation_id: conversationId },
      { message_type: "conversation", event_type: "conversation.append_llm_context", conversation_id: conversationId,
        properties: { context } },
      { message_type: "conversation", event_type: "conversation.echo", conversation_id: conversationId,
        properties: { modality: "text", text: script, done: true } },
    ]);
  });
});
