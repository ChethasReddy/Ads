import type { AdCandidate, VideoContext } from "@ads/core";

/**
 * Request payload for /api/tavus/session and TavusProvider.createSession.
 * Shape matches AGENTS.md §9.1.
 */
export interface TavusSessionInput {
  sessionId: string;
  videoContext: VideoContext;
  adCandidate: AdCandidate;
  openingScript: string;
  /** When set, sent verbatim as Tavus conversational_context (broadcast slots). */
  conversationalContext?: string;
}

/**
 * Response shape for /api/tavus/session per AGENTS.md §9.1.
 *
 * `provider: "mock"` means the frontend should render its scripted fallback
 * agent card. Mock sessions return `tavusConversationUrl` prefixed with
 * "tavus-mock://session/" so the frontend can detect them.
 */
export interface TavusSessionResult {
  provider: "tavus" | "mock";
  sessionId: string;
  tavusConversationUrl?: string;
  tavusConversationId?: string;
  meetingToken?: string;
  fallbackAgentScript?: string;
  status: "ready" | "fallback_ready";
  /** Frontend auto-close fallback; arc-aware for AD_SLOT_2. */
  adDurationSeconds?: number;
}

export interface TavusProvider {
  readonly name: "tavus" | "mock";
  createSession(input: TavusSessionInput): Promise<TavusSessionResult>;
  endSession(sessionId: string): Promise<void>;
}

/**
 * Raven-1 audio-perception tools. Each fires when Raven detects the matching
 * vocal state, and the resulting tool call reaches the backend webhook at
 * callback_url. Tool names are deliberately stable: the webhook route maps
 * them back to deterministic button signals.
 *
 * Field placement verified against docs.tavus.io (Tool Calling for Perception
 * + Perception): these tools live on the PERSONA under
 * `layers.perception.audio_tools`, NOT on the POST /v2/conversations body.
 * Each tool uses the OpenAI function-calling envelope
 * `{ type: "function", function: { name, description, parameters } }`.
 */
export const TAVUS_AUDIO_TOOLS = [
  {
    type: "function",
    function: {
      name: "mark_high_friction",
      description:
        "Call when the viewer sounds frustrated, irritated, annoyed, or has a sustained negative tone.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Short justification for the friction call.",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_engaged",
      description:
        "Call when the viewer sounds curious, interested, or is leaning in.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Short justification for the engagement call.",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_rushed",
      description:
        "Call when the viewer sounds impatient, hurried, or is asking to compress.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Short justification for the rushed call.",
          },
        },
        required: ["reason"],
      },
    },
  },
] as const;

/**
 * Instructs Raven-1 when to fire each audio tool. Tavus requires an
 * `audio_tool_prompt` alongside `audio_tools` on the perception layer.
 */
export const TAVUS_AUDIO_TOOL_PROMPT =
  "Report the viewer's audio-perceived state using your tools. " +
  "Call mark_high_friction when the viewer sounds frustrated, irritated, annoyed, or has a sustained negative tone. " +
  "Call mark_engaged when the viewer sounds curious, interested, or is leaning in. " +
  "Call mark_rushed when the viewer sounds impatient, hurried, or asks to compress. " +
  "Always include a short reason. Never use these tools to intensify persuasion.";

/**
 * Canonical persona perception layer for the ad agent. Apply this to the
 * persona referenced by TAVUS_PERSONA_ID via POST or PATCH
 * https://tavusapi.com/v2/personas. It is NOT accepted inline on the
 * conversation-create call. `buildPersonaPayload` in realProvider.ts wraps
 * this into a full persona body for one-time setup.
 */
export const TAVUS_PERSONA_PERCEPTION_LAYER = {
  perception_model: "raven-1",
  audio_tool_prompt: TAVUS_AUDIO_TOOL_PROMPT,
  audio_tools: TAVUS_AUDIO_TOOLS,
} as const;

export const TAVUS_MOCK_URL_PREFIX = "tavus-mock://session/" as const;
