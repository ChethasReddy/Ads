# Tavus Interactive AI Video Ad Experience

> Ads should understand the moment, not interrupt it.

An interactive Tavus ad agent responds to the video context and viewer feedback.
The current demo uses a recorded basketball clip and two illustrative product
concepts. It is not a real YouTube integration, live broadcast, or store.

Today, ads interrupt people without understanding the moment they are in. We
built an interactive Tavus ad agent that understands the video context, listens
to viewer feedback, adapts its pitch, and stores transparent preference memory
so future ads become less annoying and more useful. The goal is not emotional
manipulation. The goal is respectful, viewer-controlled advertising.

That is the product promise. See the implementation limits below for what is
actually available today.

## Run locally

```sh
npm ci
cp .env.example apps/web/.env.local
npm run dev
```

Open http://localhost:3000/get-started. This is an npm-workspaces repository.
Next loads the web app's environment file, not a root `.env` automatically.
An existing `apps/web/.env.local` symlink to a root `.env.local` also works.
Never commit credentials.

With the example's provider switches disabled, the ad uses a scripted card and
memory uses the process-local fallback. `NEXT_PUBLIC_DEMO_MODE` alone does not
force mock providers: keep the individual provider switches disabled for an
isolated offline run.

## Try the conversation

1. Start Session and play the video, or jump to Ad 1 at 19 seconds.
2. With Tavus configured, allow the microphone and speak to the agent. Without
   credentials, the same overlay shows the short demo script and feedback buttons.
3. Click **Tell me quickly**. The live agent receives a short product-specific
   response; the fallback card displays it. **Too long** also shortens the answer.
4. Ask a product question and a follow-up, or click **I'm interested**. Explicit
   engagement keeps the same live session open for at most 90 seconds from its
   first playable media. Inferred interest alone does not extend it.
5. Click **Skip this** at any time, including while connecting. The agent's local
   audio stops and the video resumes immediately. **Not relevant** also stops.
6. Ad 2 at 39 seconds uses earlier feedback to choose its short introduction.
   A pending negative-feedback write defers that ad; failed persistence suppresses
   it for this demo session rather than starting from stale history.

Product names are illustrative demo labels. The agent has no verified retail
price, stock, size, shipping, discount, or checkout information. It should say
when facts are missing. No purchase or order is performed.

## Integration and structure

| Location | Responsibility |
| --- | --- |
| `apps/web` | Next.js pages/API routes, Daily media, viewer controls |
| `apps/web/lib/state/tavusConversation.ts` | Per-ad lifecycle, reply invalidation, short and engaged time budgets |
| `apps/web/lib/tavus.ts` | Validated event envelopes, explicit speech intent, outgoing feedback messages |
| `packages/core` | Shared domain types, deterministic classification/planning, demo facts |
| `packages/integrations` | Tavus REST provider and Redis Iris adapters |

Tavus CVI sessions are created with raw REST calls and rendered through
`@daily-co/daily-js`. The active frontend uses media tracks, not an iframe.
Feedback interrupts speech, appends safe conversational context, and echoes the
approved response. Questions stay in Tavus's existing conversational pipeline.
No additional LLM service was added.

See [Tavus setup, protocol, troubleshooting, and checks](docs/tavus.md).
`AGENTS.md` remains the canonical product policy. `CLAUDE.md` covers backend
ownership; the referenced `CODEX.md` companion is currently missing.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
# With the dev server running and Tavus/Redis switches disabled:
node apps/web/scripts/smoke.mjs
```

Frontend tests mount the real page and agent panel with simulated Daily/network
boundaries. They verify command delivery, local audio teardown, duplicate and
late events, fallback, and timing. They do not prove actual microphone
transcription or live model answer quality. The live replay checklist is in
[docs/tavus.md](docs/tavus.md#live-replay).

## Current limits

- Browser speech support varies. Buttons always cover the feedback flow. A
  browser speech failure does not disable the Daily/Tavus microphone path.
- Skip mutes/detaches browser media and leaves the Daily call immediately from
  the viewer's perspective. Remote `endSession` is still unimplemented; Tavus's
  configured 180-second provider limit remains the remote backstop.
- The implementation uses Redis Iris, while `AGENTS.md`/`CLAUDE.md` specify
  Upstash and an Anthropic adapter. Those stack deviations are unresolved.
- Memory/history currently includes emotion signals. The visible memory and
  next-ad panels are placeholders, Clear is not wired, remote deletion is
  incomplete, and no localStorage mirror exists. Do not describe these as
  completed transparency features. This slice does not change stored history.
- No live retail lookup, model migration, persona update, or production rollout
  is included in these fixes.
