import { z } from "zod";
import type { ButtonSignal } from "@ads/core";

export const TAVUS_MOCK_URL_PREFIX = "tavus-mock://session/";
export function isMockTavusUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith(TAVUS_MOCK_URL_PREFIX);
}

export const TavusSessionSchema = z.object({
  provider: z.enum(["tavus", "mock"]), sessionId: z.string(),
  tavusConversationUrl: z.string().optional(), tavusConversationId: z.string().optional(),
  meetingToken: z.string().optional(), fallbackAgentScript: z.string().optional(),
  status: z.enum(["ready", "fallback_ready"]), adDurationSeconds: z.number().positive().max(90).optional(),
}).refine((session) => session.provider === "mock" ||
  (Boolean(session.tavusConversationId) && /^https:\/\//.test(session.tavusConversationUrl ?? "")));
export type TavusSessionResponse = z.infer<typeof TavusSessionSchema>;
export type FeedbackSource = "button" | "speech" | "perception";
export type FeedbackCommand = { id: number; script: string; signal: ButtonSignal; source: FeedbackSource };

const RAVEN_SIGNALS: Record<string, ButtonSignal> = {
  mark_high_friction: "annoyed", mark_engaged: "interested", mark_rushed: "tell_me_quickly",
};
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

type TavusEvent =
  | { kind: "feedback"; signal: ButtonSignal; source: "perception" }
  | { kind: "utterance"; role: "user" | "replica"; text: string; final: boolean };

export function parseTavusEvent(data: unknown, conversationId: string): TavusEvent | null {
  if (!record(data) || data.message_type !== "conversation" || !conversationId ||
      data.conversation_id !== conversationId || !record(data.properties)) return null;
  const props = data.properties;
  if (data.event_type === "conversation.perception_tool_call") {
    const name = props.name;
    return typeof name === "string" && Object.hasOwn(RAVEN_SIGNALS, name)
      ? { kind: "feedback", signal: RAVEN_SIGNALS[name], source: "perception" } : null;
  }
  if (data.event_type !== "conversation.utterance" && data.event_type !== "conversation.utterance.streaming") return null;
  const role = props.role === "pal" ? "replica" : props.role;
  if ((role !== "user" && role !== "replica") || typeof props.speech !== "string" || !props.speech.trim()) return null;
  return { kind: "utterance", role, text: props.speech.trim(),
    final: data.event_type === "conversation.utterance" || props.final === true };
}

/** Explicit intent only. Incidental/negated stop words must not terminate Q&A. */
export function classifyViewerSpeech(text: string): ButtonSignal | "question" | null {
  const value = text.toLowerCase().replace(/[’]/g, "'").trim();
  if (/\b(don't|do not|can't|cannot|won't|never)\s+(?:\w+\s+)?(?:stop|skip|quit)\b/.test(value)) return null;
  if (/^(?:(?:please|can you|could you|would you|nah|no|okay|ok)[, ]+)*(?:stop|skip|enough|quit)\b/.test(value) ||
      /\b(no thanks|not now|leave me alone|stop interrupting|(?:don't|do not) want to hear more|(?:want|trying) to watch (?:the )?(?:game|video))\b/.test(value)) return "skip";
  if (/\b(not (?:really |at all )?interested|not relevant|don't need|unrelated|wrong product)\b/.test(value)) return "not_relevant";
  if (/\b(annoying|annoyed|irritating|irritated)\b/.test(value)) return "annoyed";
  if (/\b(too long|long intro)\b/.test(value)) return "too_long";
  if (/\b(tell me quickly|keep it short|one line|hurry|quick summary)\b/.test(value)) return "tell_me_quickly";
  if (/\b(interested|tell me more|sounds useful)\b/.test(value)) return "interested";
  if (/\?|^(?:and |but )?(?:what|why|how|where|when|which|does|do|is|are|can|could|would|will)\b/.test(value)) return "question";
  return null;
}

const FEEDBACK_CONTEXT: Partial<Record<ButtonSignal, string>> = {
  too_long: "The viewer prefers a shorter ad. Keep the answer to one sentence and do not restart the pitch.",
  tell_me_quickly: "The viewer prefers a direct utility summary. Keep the answer to one sentence and do not restart the pitch.",
  annoyed: "Reduce interruption and pressure. Acknowledge once, keep it brief, and do not continue persuasion.",
  interested: "Answer concise product follow-up questions using only supplied facts. Do not restart the pitch or invent offers.",
};
export function feedbackMessages(conversationId: string, script: string, signal: ButtonSignal) {
  const base = { message_type: "conversation", conversation_id: conversationId };
  if (!conversationId || signal === "skip" || signal === "not_relevant") return [];
  return [
    { ...base, event_type: "conversation.interrupt" },
    { ...base, event_type: "conversation.append_llm_context", properties: { context: FEEDBACK_CONTEXT[signal] } },
    { ...base, event_type: "conversation.echo", properties: { modality: "text", text: script, done: true } },
  ];
}

/** Covers headers and body reads; cancellation is scoped to this request. */
export async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(8000);
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  if (res.headers.get("x-fallback-used") === "true") throw new Error("Memory persistence was not confirmed");
  return res.json();
}
