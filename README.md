# Tavus Interactive AI Video Ad Experience

> Ads should understand the moment, not interrupt it.

## What this is

Today, ads interrupt people without understanding the moment they are in. We
built an interactive Tavus ad agent that understands the video context, listens
to viewer feedback, adapts its pitch, and stores transparent preference memory
so future ads become less annoying and more useful. The goal is not emotional
manipulation. The goal is respectful, viewer-controlled advertising.

## 60-second demo flow

The intended full loop runs in 60–90 seconds and presents in under 3 minutes.
It mirrors the staged flow in `AGENTS.md` §7:

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
   route as the buttons for friction and rushed signals. Inferred engagement
   alone is ignored and cannot lengthen an ad.
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
cp .env.example apps/web/.env.local

# 2. Install (npm workspaces — this repo uses npm, not pnpm)
npm install

# 3. Run the app
npm run dev

# 4. In a second shell, run the end-to-end smoke test against the dev server
node apps/web/scripts/smoke.mjs
```

The demo is built to run offline. With the Tavus and Redis provider switches
disabled, the app falls back to a scripted mock agent and in-memory preference
storage. `NEXT_PUBLIC_DEMO_MODE` alone does not disable configured providers.
Next reads environment variables from `apps/web/.env.local`.

To run with real Tavus, set `TAVUS_API_KEY`, `TAVUS_REPLICA_ID`,
`TAVUS_PERSONA_ID`, and `NEXT_PUBLIC_TAVUS_ENABLED=true`. The persona referenced
by `TAVUS_PERSONA_ID` must carry the Raven-1 perception layer with the three
audio tools (see `buildPersonaPayload` in
`packages/integrations/src/tavus/realProvider.ts`). Raven-1 tool calls are
received client-side over Daily.js, so no inbound webhook URL is required.

## Locked stack

| Layer | Choice | Notes |
| --- | --- | --- |
| AI video agent | **Tavus CVI** | `POST /v2/conversations`, raw `fetch`, no SDK. The frontend joins the returned `conversation_url` with Daily.js and renders its audio/video tracks. |
| Perception | **Tavus Raven-1** | Multimodal perception reads vocal tone in real time and fires `mark_high_friction` / `mark_engaged` / `mark_rushed` audio tools. Tool calls arrive over Daily.js (`app-message`). Friction/rushed signals enter `/api/feedback`; inferred engagement is ignored. Final user transcripts also support explicit feedback and product questions. |
| Memory | **Redis Iris** (current adapter) | Stores preferences, session mode, and interaction history with an in-memory fallback. `AGENTS.md` specifies Upstash; that migration is not part of these fixes. |
| Safety | **Deterministic safety planner** | Pure, unit-tested functions in `@ads/core`. No model is in the correctness or safety path. |

Stack rules (from `AGENTS.md` §5 and `CLAUDE.md`): npm workspaces with
`apps/web` + `packages/core` + `packages/integrations`; Zod for runtime
validation; no second Redis client, no LLM SDK, no Tavus SDK.

### Current integration details

- `/get-started` currently uses the basketball clip with ad markers at 19 and
  39 seconds; the staged flow above remains the product specification.
- Feedback interrupts the live agent, appends safe context, and speaks the
  approved product-specific response. Skip immediately silences local media and
  resumes the video, including during connection or a pending feedback request.
- Explicit product questions or interested clicks allow follow-ups for at most
  90 seconds from playable media. Product briefs identify illustrative facts and
  unknown retail details instead of supplying unverified offers.
- Pending negative-feedback writes defer the next automatic ad; unconfirmed
  history persistence suppresses it for the session.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` for
  automated checks. Live speech quality still needs a microphone replay.

See [the Tavus integration guide](docs/tavus.md) for event schemas, lifecycle
limits, troubleshooting, and the live replay checklist.

## Safety story

The safety policy is to store ad-experience *preferences* — shorter ads, lower
interruption frequency, direct utility pitches — never a psychological profile
or a "this viewer is vulnerable" inference. The current history adapter still
stores emotion signals; this remains an implementation gap against that policy.
Every handled feedback event, whether a button click or a Raven-1 tool call,
runs through the same deterministic
pipeline: classify friction, plan a safe response, build a memory update, then a
safety check that rewrites any response that would increase pressure and blocks
any unsafe label before it can reach storage. The blocked unsafe labels are
surfaced through the API so the UI can explain the boundary. The current memory
and next-ad panels are placeholders, and Clear is not yet wired.
