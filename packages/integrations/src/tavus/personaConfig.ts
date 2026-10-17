import type { AdCandidate, VideoContext } from "@ads/core";

/**
 * A single ad-agent persona. Each persona maps to a distinct Tavus persona +
 * replica pair (provisioned out of band; ids come from env vars at resolve
 * time) plus a tone fragment that flavors the conversational context.
 *
 * personaId / replicaId default to "" in the catalog and are filled from
 * TAVUS_PERSONA_ID_{KEY} / TAVUS_REPLICA_ID_{KEY} by resolvePersona(). An empty
 * id means the caller should fall back to the global TAVUS_PERSONA_ID /
 * TAVUS_REPLICA_ID defaults.
 */
export interface AdPersonaConfig {
  /** Stable catalog key. Uppercased to form env var suffixes. */
  key: string;
  /** Human-readable label for logs and the handoff. */
  label: string;
  /** Tavus persona id, from TAVUS_PERSONA_ID_{KEY}. "" when unset. */
  personaId: string;
  /** Tavus replica id, from TAVUS_REPLICA_ID_{KEY}. "" when unset. */
  replicaId: string;
  /** Tone/style fragment prepended to the conversational context. */
  systemStyle: string;
  /** Lowercase substrings matched against AdCandidate.category. */
  matchKeywords: string[];
}

/**
 * Shared de-escalation rule appended to every persona's context. Mirrors the
 * safety posture in AGENTS.md §12.3: acknowledge once, shorten or stop, never
 * intensify persuasion after negative feedback.
 */
const DE_ESCALATION_RULE =
  "If the viewer sounds annoyed, rushed, uninterested, or asks to skip, " +
  "acknowledge once, shorten or stop, and do not continue persuasion. " +
  "Never exploit frustration, urgency, identity, or vulnerability.";

/**
 * The catalog. Order matters: resolvePersona() checks non-default entries top
 * to bottom and returns the first whose keywords appear in the category.
 * "default" is the catch-all and is never keyword-matched.
 */
export const PERSONA_CATALOG: Record<string, AdPersonaConfig> = {
  developer_tool: {
    key: "developer_tool",
    label: "Developer & Design Tools Agent",
    personaId: "",
    replicaId: "",
    systemStyle:
      "You are a calm, technical product agent for developer and design " +
      "tools. Be direct and utility-first. Lead with the concrete workflow " +
      "win, not hype.",
    matchKeywords: [
      "developer",
      "design",
      "dev tool",
      "design tool",
      "engineering",
      "code",
      "ide",
      "api",
    ],
  },
  productivity: {
    key: "productivity",
    label: "Productivity & SaaS Agent",
    personaId: "",
    replicaId: "",
    systemStyle:
      "You are a concise productivity agent for SaaS and workflow tools. " +
      "Focus on time saved and friction removed. Keep it practical and short.",
    matchKeywords: [
      "productivity",
      "saas",
      "workflow",
      "business",
      "work",
      "team",
      "collaboration",
      "office",
    ],
  },
  sports: {
    key: "sports",
    label: "Sports & Live Broadcast Agent",
    personaId: "",
    replicaId: "",
    systemStyle:
      "You are a calm, respectful courtside ad agent during a live sports " +
      "broadcast. Keep pitches short, contextual to the moment on screen, and " +
      "never interrupt the game longer than necessary.",
    matchKeywords: [
      "basketball",
      "basketball_shoe",
      "team_jersey",
      "jersey",
      "shoe",
      "nba",
      "knicks",
      "sports",
      "finals",
      "broadcast",
    ],
  },
  default: {
    key: "default",
    label: "General Respectful Ad Agent",
    personaId: "",
    replicaId: "",
    systemStyle:
      "You are a calm, direct, respectful ad agent. Keep pitches short and " +
      "utility-first, and let the viewer stay in control.",
    matchKeywords: [],
  },
};

/** Catalog keys checked, in priority order, before falling back to default. */
const MATCH_ORDER = ["developer_tool", "productivity", "sports"] as const;

function envId(prefix: "TAVUS_PERSONA_ID" | "TAVUS_REPLICA_ID", key: string): string {
  return process.env[`${prefix}_${key.toUpperCase()}`] ?? "";
}

/**
 * Resolves a persona from an AdCandidate.category by simple case-insensitive
 * substring matching (sufficient for the demo per the feature brief). Returns
 * a copy of the catalog entry with personaId / replicaId populated from the
 * matching env vars at call time, so config changes do not require a rebuild.
 */
export function resolvePersona(category: string): AdPersonaConfig {
  const normalized = (category ?? "").toLowerCase();

  let matched = PERSONA_CATALOG.default;
  for (const key of MATCH_ORDER) {
    const entry = PERSONA_CATALOG[key];
    if (entry.matchKeywords.some((kw) => normalized.includes(kw))) {
      matched = entry;
      break;
    }
  }

  return {
    ...matched,
    personaId: envId("TAVUS_PERSONA_ID", matched.key),
    replicaId: envId("TAVUS_REPLICA_ID", matched.key),
  };
}

/**
 * Builds the Tavus `conversational_context` string (AGENTS.md §12.1: opening
 * pitch plus safety system prompt). Combines the persona tone, the video the
 * viewer is watching, the ad being pitched, the scripted opening line, and the
 * shared de-escalation rule into a single grounded prompt.
 */
export function buildConversationalContext(input: {
  persona: AdPersonaConfig;
  videoContext: VideoContext;
  adCandidate: AdCandidate;
  openingScript: string;
}): string {
  const { persona, videoContext, adCandidate, openingScript } = input;

  return [
    persona.systemStyle,
    `The viewer is watching: "${videoContext.title}" (topic: ${videoContext.topic}). ` +
      `Viewer mode: ${videoContext.viewerMode}. Interruption risk: ${videoContext.interruptionRisk}. ` +
      `Recommended ad style: ${videoContext.recommendedAdStyle}.`,
    `You are presenting ${adCandidate.productName} (${adCandidate.category}). ` +
      `Pitch angle: ${adCandidate.pitchAngle}. Why it is relevant: ${adCandidate.relevanceReason}.`,
    `Open with this line: ${openingScript}`,
    DE_ESCALATION_RULE,
    "Answer the current question and follow-up questions in one or two sentences using only supplied facts. Do not restart the pitch. Price, stock, sizes and shipping are unknown unless supplied: say you do not know rather than invent an offer. On stop or skip, stop immediately with no final sales pitch.",
  ].join("\n\n");
}
