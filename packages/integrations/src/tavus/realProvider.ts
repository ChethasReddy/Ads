import {
  buildConversationalContext,
  resolvePersona,
} from "./personaConfig";
import {
  TAVUS_PERSONA_PERCEPTION_LAYER,
  type TavusProvider,
  type TavusSessionInput,
  type TavusSessionResult,
} from "./types";

const TAVUS_ENDPOINT = "https://tavusapi.com/v2/conversations" as const;

/**
 * Builds the persona body that carries the Raven-1 perception layer (with the
 * three audio_tools). Apply once via POST https://tavusapi.com/v2/personas to
 * create TAVUS_PERSONA_ID, or PATCH an existing persona's perception layer.
 *
 * This is exported because the conversation-create endpoint does NOT accept
 * `audio_tools` inline (verified against docs.tavus.io): perception tools are
 * a persona-layer concern. createSession only references the persona by id.
 */
export function buildPersonaPayload(replicaId: string): Record<string, unknown> {
  return {
    persona_name: "Respectful Ad Agent",
    default_replica_id: replicaId,
    pipeline_mode: "full",
    system_prompt:
      "You are a calm, direct, respectful ad agent. Keep pitches short and " +
      "utility-first. If the viewer sounds annoyed, rushed, or uninterested, " +
      "acknowledge once, shorten or stop, and never intensify persuasion.",
    layers: {
      perception: TAVUS_PERSONA_PERCEPTION_LAYER,
    },
  };
}

export interface RealTavusProviderOptions {
  apiKey: string;
  replicaId: string;
  personaId: string;
  timeoutMs: number;
}

interface TavusConversationResponse {
  conversation_id?: string;
  conversation_url?: string;
  meeting_token?: string;
  status?: string;
}

/**
 * Calls POST https://tavusapi.com/v2/conversations per AGENTS.md §12.1.
 *
 * Body fields verified against docs.tavus.io (Create Conversation):
 *   replica_id, persona_id, conversation_name, conversational_context,
 *   properties.{ max_call_duration, enable_recording }
 *
 * The three Raven-1 audio_tools are NOT sent here. The create-conversation
 * endpoint does not accept `audio_tools`; perception tools are configured on
 * the persona at `layers.perception.audio_tools`. Use buildPersonaPayload to
 * provision TAVUS_PERSONA_ID once. The conversation only references it by id.
 *
 * No callback_url is set: Raven-1 perception tool calls are delivered to the
 * browser over Daily.js (`app-message` events), not to a backend webhook. The
 * frontend maps those events to button signals and POSTs /api/feedback, so the
 * Raven-1 path and button clicks converge on the same backend route.
 *
 * Errors bubble up as exceptions. The /api/tavus/session route converts any
 * failure into a mock fallback response when ENABLE_PROVIDER_FALLBACKS=true.
 */
export class RealTavusProvider implements TavusProvider {
  readonly name = "tavus" as const;
  private readonly options: RealTavusProviderOptions;

  constructor(options: RealTavusProviderOptions) {
    this.options = options;
  }

  async createSession(
    input: TavusSessionInput,
  ): Promise<TavusSessionResult> {
    // Route the ad category to a persona. Per-category ids
    // (TAVUS_PERSONA_ID_{KEY}) win; fall back to the global TAVUS_PERSONA_ID /
    // TAVUS_REPLICA_ID when a category-specific id is not configured.
    const persona = resolvePersona(input.adCandidate.category);
    const conversationalContext =
      input.conversationalContext ??
      buildConversationalContext({
        persona,
        videoContext: input.videoContext,
        adCandidate: input.adCandidate,
        openingScript: input.openingScript,
      });

    const body = {
      replica_id: persona.replicaId || this.options.replicaId,
      persona_id: persona.personaId || this.options.personaId,
      conversation_name: `ad-demo-${input.sessionId}`,
      conversational_context: conversationalContext,
      properties: {
        max_call_duration: 180,
        enable_recording: false,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    let data: TavusConversationResponse;
    try {
      const response = await fetch(TAVUS_ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": this.options.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Tavus create-conversation failed: ${response.status}`);
      data = (await response.json()) as TavusConversationResponse;
    } finally {
      clearTimeout(timer);
    }

    if (!data.conversation_url || !data.conversation_id) {
      throw new Error("Tavus response missing conversation_url or conversation_id");
    }

    return {
      provider: "tavus",
      sessionId: input.sessionId,
      tavusConversationUrl: data.conversation_url,
      tavusConversationId: data.conversation_id,
      meetingToken: data.meeting_token,
      status: "ready",
    };
  }

  async endSession(_sessionId: string): Promise<void> {
    // Tavus auto-expires conversations at max_call_duration. Explicit end is
    // not required for the demo. Wire up POST /v2/conversations/{id}/end here
    // if a hard teardown is needed.
  }
}
