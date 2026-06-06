# Tavus Interactive AI Video Ad Experience

> Ads should understand the moment, not interrupt it.

## What this is

Today, ads interrupt people without understanding the moment they are in. We
built an interactive Tavus ad agent that understands the video context, listens
to viewer feedback, adapts its pitch, and stores transparent preference memory
so future ads become less annoying and more useful. The goal is not emotional
manipulation. The goal is respectful, viewer-controlled advertising.

## 60-second demo flow

The full loop runs in 60–90 seconds and presents in under 3 minutes. It mirrors
the staged flow in `AGENTS.md` §7:

1. **Landing** — Hero line "Ads should understand the moment, not interrupt it."
   with a single `Start Demo` call to action.
2. **YouTube-style simulator** — A controlled video (`How to build a startup
   demo in 24 hours`) plays with the viewer in a focused, interruption-sensitive
   state.
3. **Context intelligence panel** — Surfaces topic, viewer mode, ad opportunity,
   interruption risk, and the recommended short-utility ad style.
4. **Tavus ad agent appears** — A Tavus CVI agent (or the scripted mock when
   Tavus is offline) delivers a short, contextual pitch.
5. **Viewer reaction layer** — Six buttons (`Too long`, `Not relevant`,
   `I'm annoyed`, `Tell me quickly`, `I'm interested`, `Skip this`) plus optional
   voice. In parallel, Raven-1 perception watches tone in real time; its tool
   calls arrive in the browser via Daily.js and feed the same `/api/feedback`
   route as the buttons.
6. **Friction detection** — The feedback is classified into friction level,
   emotion signal, intent, ad risk, and a recommended action.
7. **Adaptive response** — The agent shortens, clarifies, stops, or continues —
   and never increases pressure after negative feedback.
8. **Memory update** — Safe preference chips appear (e.g. "Prefers shorter ads",
   "Reduce interruption frequency"). Blocked unsafe labels are shown to prove the
   safety boundary.
9. **Next-ad decision** — A shorter, more direct, lower-frequency strategy for
   the next ad, computed from the stored safe preferences.

## Getting started

```bash
# 1. Configure environment (defaults run the full demo with zero external APIs)
cp .env.example .env

# 2. Install (npm workspaces — this repo uses npm, not pnpm)
npm install

# 3. Run the app
npm run dev

# 4. In a second shell, run the end-to-end smoke test against the dev server
node apps/web/scripts/smoke.mjs
```

The demo is built to run fully offline. With no Tavus and no Redis credentials,
the app falls back to a scripted mock agent and in-memory preference storage,
and every API route returns a typed fallback instead of failing.

To run with real Tavus, set `TAVUS_API_KEY`, `TAVUS_REPLICA_ID`,
`TAVUS_PERSONA_ID`, and `NEXT_PUBLIC_TAVUS_ENABLED=true`. The persona referenced
by `TAVUS_PERSONA_ID` must carry the Raven-1 perception layer with the three
audio tools (see `buildPersonaPayload` in
`packages/integrations/src/tavus/realProvider.ts`). Raven-1 tool calls are
received client-side over Daily.js, so no inbound webhook URL is required.

## Locked stack

| Layer | Choice | Notes |
| --- | --- | --- |
| AI video agent | **Tavus CVI** | `POST /v2/conversations`, raw `fetch`, no SDK. The frontend embeds the returned `conversation_url` in an iframe. |
| Perception | **Tavus Raven-1** | Multimodal perception reads vocal tone in real time and fires `mark_high_friction` / `mark_engaged` / `mark_rushed` audio tools. Tool calls arrive in the browser over Daily.js (`app-message`), are mapped to button signals, and POST to `/api/feedback` exactly like a click. Replaces text-based emotion classification. |
| Memory | **Upstash Redis** (`@upstash/redis`, REST) | Stores safe preferences and session mode. Falls back to an in-memory provider when credentials are absent. |
| Safety | **Deterministic safety planner** | Pure, unit-tested functions in `@ads/core`. No model is in the correctness or safety path. |

Stack rules (from `AGENTS.md` §5 and `CLAUDE.md`): npm workspaces with
`apps/web` + `packages/core` + `packages/integrations`; Zod for runtime
validation; no second Redis client, no LLM SDK, no Tavus SDK.

## Safety story

Raven-1 detects emotion in real time, but **no emotion label is ever persisted
in Redis**. What persists is the resulting *preference* — shorter ads, lower
interruption frequency, direct utility pitches — never a psychological profile
or a "this viewer is vulnerable" inference. Every feedback event, whether a
button click or a Raven-1 tool call, runs through the same deterministic
pipeline: classify friction, plan a safe response, build a memory update, then a
safety check that rewrites any response that would increase pressure and blocks
any unsafe label before it can reach storage. The blocked unsafe labels are
surfaced through the API and shown in the UI on purpose: the boundary is a
feature, and we prove it rather than assert it.
