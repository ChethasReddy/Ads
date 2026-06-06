#!/usr/bin/env node
/**
 * End-to-end smoke test for the four Chunk B routes.
 *
 * Usage:
 *   1. In one shell: `npm run dev` (from repo root)
 *   2. In another: `node apps/web/scripts/smoke.mjs`
 *
 * Verifies, against the in-memory provider (no UPSTASH env vars required):
 *   - POST /api/feedback for annoyed signal returns de_escalate, never continue.
 *   - POST /api/feedback for skip returns shouldStop=true.
 *   - GET  /api/memory returns the stored preferences + provider name.
 *   - POST /api/next-ad returns shorter length after annoyed.
 *   - DELETE /api/memory clears the session.
 *   - POST /api/tavus/session (no Tavus env) returns provider "mock" + script.
 *   - Raven-1 mark_high_friction (delivered browser-side via Daily.js, then
 *     POSTed to /api/feedback) produces the annoyed outcome in memory.
 *   - Raven-1 mark_engaged via /api/feedback does not block on safety.
 *
 * Raven-1 perception tool calls reach the browser over Daily.js, not a backend
 * webhook. The frontend maps tool_name -> buttonSignal and calls /api/feedback
 * exactly like a button click, so these assertions exercise /api/feedback with
 * the mapped signals.
 *
 * Exits non-zero on the first failed assertion.
 */

// Mirror of the frontend's Daily.js perception-tool-call -> buttonSignal map.
const RAVEN_SIGNAL_MAP = {
  mark_high_friction: "annoyed",
  mark_engaged: "interested",
  mark_rushed: "tell_me_quickly",
};

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const sessionId = `smoke-${Date.now()}`;

const videoContext = {
  id: "startup-demo-24h",
  title: "How to build a startup demo in 24 hours",
  topic: "Startup demo building",
  tags: ["startup", "hackathon", "demo"],
  transcriptSnippet: "Turn a rough idea into a polished demo.",
  viewerMode: "focused",
  interruptionRisk: "high",
  recommendedAdStyle: "short_utility",
};

const adCandidate = {
  id: "demo-screen-builder",
  productName: "LaunchFrame AI",
  category: "Developer or design tool",
  pitchAngle: "Create polished demo screens from a rough product idea.",
  defaultLengthSeconds: 20,
  relevanceReason: "Viewer is building a hackathon demo.",
};

function feedback(buttonSignal, idSuffix) {
  return {
    id: `feedback-${idSuffix}`,
    sessionId,
    buttonSignal,
    timestamp: new Date().toISOString(),
  };
}

function feedbackFor(sid, buttonSignal, idSuffix) {
  return {
    id: `feedback-${idSuffix}`,
    sessionId: sid,
    buttonSignal,
    timestamp: new Date().toISOString(),
  };
}

function assert(cond, label, extra) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
    process.exit(1);
  }
  console.log(`  ok: ${label}`);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  return { status: res.status, json };
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  const json = await res.json();
  return { status: res.status, json };
}

console.log(`smoke: base=${BASE} sessionId=${sessionId}`);

// 1. annoyed -> safe response, never continue
console.log("POST /api/feedback (annoyed)");
const annoyed = await post("/api/feedback", {
  sessionId,
  feedback: feedback("annoyed", "1"),
  videoContext,
  adCandidate,
});
assert(annoyed.status === 200, "status 200", annoyed);
assert(
  annoyed.json.agentResponse.strategy !== "continue",
  "agentResponse.strategy !== 'continue' after annoyed",
  annoyed.json.agentResponse,
);
assert(
  annoyed.json.agentResponse.strategy === "de_escalate",
  "agentResponse.strategy === 'de_escalate' for annoyed",
  annoyed.json.agentResponse,
);
assert(
  annoyed.json.memoryUpdate.allowedPreferences.length > 0,
  "memoryUpdate.allowedPreferences non-empty",
  annoyed.json.memoryUpdate,
);
assert(
  annoyed.json.memoryUpdate.blockedUnsafeLabels.length > 0,
  "memoryUpdate.blockedUnsafeLabels populated (safety demo)",
  annoyed.json.memoryUpdate,
);

// 2. GET /api/memory
console.log("GET /api/memory");
const mem = await get(`/api/memory?sessionId=${sessionId}`);
assert(mem.status === 200, "status 200", mem);
assert(
  mem.json.provider === "memory",
  "provider === 'memory' (no UPSTASH env)",
  mem.json,
);
assert(
  mem.json.preferences.length > 0,
  "preferences persisted across requests",
  mem.json,
);
assert(
  mem.json.currentMode === "low_interruption",
  "currentMode === 'low_interruption' after annoyed",
  mem.json,
);

// 3. POST /api/next-ad
console.log("POST /api/next-ad");
const next = await post("/api/next-ad", { sessionId, videoContext });
assert(next.status === 200, "status 200", next);
assert(
  next.json.decision.lengthSeconds < 20,
  "lengthSeconds reduced from default (20) after annoyed",
  next.json.decision,
);
assert(
  next.json.decision.frequencyRules.length > 0,
  "frequencyRules populated",
  next.json.decision,
);

// 4. skip path
console.log("POST /api/feedback (skip)");
const skip = await post("/api/feedback", {
  sessionId,
  feedback: feedback("skip", "2"),
  videoContext,
  adCandidate,
});
assert(skip.status === 200, "status 200", skip);
assert(
  skip.json.agentResponse.shouldStop === true,
  "skip -> agentResponse.shouldStop === true",
  skip.json.agentResponse,
);

// 5. DELETE clears
console.log("DELETE /api/memory");
const cleared = await del(`/api/memory?sessionId=${sessionId}`);
assert(cleared.status === 200 && cleared.json.cleared === true, "cleared", cleared);
const after = await get(`/api/memory?sessionId=${sessionId}`);
assert(
  after.json.preferences.length === 0,
  "preferences empty after DELETE",
  after.json,
);

// 6. validation error
console.log("POST /api/feedback (invalid body)");
const bad = await post("/api/feedback", { sessionId: "x" });
assert(bad.status === 400, "status 400 on bad body", bad);
assert(bad.json.code === "VALIDATION_ERROR", "code === VALIDATION_ERROR", bad.json);

// 7. Tavus session falls back to mock when Tavus env is unset
console.log("POST /api/tavus/session (no Tavus env -> mock)");
const tavusSession = await post("/api/tavus/session", {
  sessionId,
  videoContext,
  adCandidate,
  openingScript:
    "Hey, I see you're watching a hackathon build video. I'll keep this short.",
});
assert(tavusSession.status === 200, "status 200", tavusSession);
assert(
  tavusSession.json.provider === "mock",
  "provider === 'mock' (no Tavus env)",
  tavusSession.json,
);
assert(
  typeof tavusSession.json.fallbackAgentScript === "string" &&
    tavusSession.json.fallbackAgentScript.length > 0,
  "fallbackAgentScript present",
  tavusSession.json,
);
assert(
  typeof tavusSession.json.tavusConversationUrl === "string" &&
    tavusSession.json.tavusConversationUrl.startsWith("tavus-mock://session/"),
  "tavusConversationUrl uses tavus-mock://session/ prefix",
  tavusSession.json,
);

// 8. Raven-1 mark_high_friction (Daily.js -> /api/feedback) -> annoyed outcome
const tavusSessionId = `smoke-tavus-${Date.now()}`;
console.log("POST /api/feedback (Raven-1 mark_high_friction)");
const friction = await post("/api/feedback", {
  sessionId: tavusSessionId,
  feedback: feedbackFor(tavusSessionId, RAVEN_SIGNAL_MAP.mark_high_friction, "raven-1"),
  videoContext,
  adCandidate,
});
assert(friction.status === 200, "status 200", friction);
assert(
  friction.json.agentResponse.strategy !== "continue",
  "Raven-1 friction never escalates (strategy !== 'continue')",
  friction.json.agentResponse,
);

console.log("GET /api/memory (after Raven-1 mark_high_friction)");
const tavusMem = await get(`/api/memory?sessionId=${tavusSessionId}`);
assert(tavusMem.status === 200, "status 200", tavusMem);
assert(
  tavusMem.json.preferences.length > 0,
  "preferences persisted from Raven-1 friction event",
  tavusMem.json,
);
assert(
  tavusMem.json.currentMode === "low_interruption",
  "currentMode === 'low_interruption' (matches annoyed button outcome)",
  tavusMem.json,
);

// 9. Raven-1 mark_engaged via /api/feedback does not block on safety
const engagedSessionId = `smoke-tavus-engaged-${Date.now()}`;
console.log("POST /api/feedback (Raven-1 mark_engaged)");
const engaged = await post("/api/feedback", {
  sessionId: engagedSessionId,
  feedback: feedbackFor(engagedSessionId, RAVEN_SIGNAL_MAP.mark_engaged, "raven-2"),
  videoContext,
  adCandidate,
});
assert(engaged.status === 200, "status 200 (mark_engaged not blocked)", engaged);
assert(
  engaged.json.agentResponse.safetyStatus !== "blocked",
  "mark_engaged response not safety-blocked",
  engaged.json.agentResponse,
);

console.log("smoke: all assertions passed");
