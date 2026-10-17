# Live Tavus integration

## Configuration

The web application reads `apps/web/.env.local`. For live mode configure
`TAVUS_API_KEY`, `TAVUS_PERSONA_ID`, `TAVUS_REPLICA_ID`, and
`NEXT_PUBLIC_TAVUS_ENABLED=true`. Restart Next after changing public environment
flags. Optional category-specific IDs in `.env.example` override the global IDs.
Do not paste API keys, meeting tokens, or private conversation URLs into logs.

The referenced remote persona must already exist. `buildPersonaPayload` is a
configuration helper, not a deployment script: editing it does not update a
remote persona. Verify its prompt, microphone/STT settings, and attached audio
perception tools against the intended configuration in your Tavus account.
The expected perception tool names are `mark_high_friction`, `mark_rushed`, and
`mark_engaged`. They map to the same feedback signals as the UI controls.

Current Tavus documentation uses PAL/face terminology. This repository retains
its configured persona/replica integration. Check compatibility with the account
before a separate API migration; do not silently replace working remote IDs.

## Runtime path

1. The player reaches an ad marker and POSTs `/api/tavus/session`.
2. The server owns product and video metadata for slots 0 and 1, builds grounded
   context, and creates a Tavus session. Generic requests without `adIndex` retain
   their supplied metadata. Invalid slot indices are rejected.
3. The panel joins Daily with the conversation URL/token and reads media tracks.
   The conversation ID comes directly from the session response.
4. Final explicit speech intent and buttons enter `/api/feedback`; raw transcripts
   from this frontend are not submitted as preference memory. Product questions
   stay in the Tavus conversation and opt into bounded follow-up time.
5. A nonterminal feedback response sends `conversation.interrupt`,
   `conversation.append_llm_context`, then `conversation.echo` containing the
   exact approved text. The UI displays that answer. Inferred interest updates
   context only and cannot opt the viewer into a longer ad.
   Feedback received while Daily connects is held until replica media is ready;
   only the latest approved response is delivered, once.
6. A hard stop silences/detaches local media and resumes the video before any
   feedback request or asynchronous Daily cleanup is awaited.

The backend deterministic planner and browser fallback both use shared core
functions. If feedback storage fails, the local response still works and the UI
reports that memory was not confirmed. Negative feedback writes are ordered;
future automatic ads wait while they are pending, and are suppressed after a
failure until Start Session resets the demo.

## Event handling

Daily `app-message.data` must be an object with the current `conversation_id`,
`message_type: conversation`, and a recognized `event_type`.

| Event | Consumed fields | Effect |
| --- | --- | --- |
| `conversation.perception_tool_call` | `properties.name` | Map allowlisted tool to feedback, retaining perception origin |
| `conversation.utterance` | `properties.role`, `properties.speech` | Process final user speech |
| `conversation.utterance.streaming` | same fields plus boolean `properties.final` | Process only final user text |
| Replica speech completion | none | Does not dismiss the ad after an answer |

The parser accepts legacy `replica` and current `pal` roles as agent speech.
Those utterances do not trigger user intent. Event deduplication uses turn/sequence
identity when present, with a short repeated-event window otherwise. Wrong-call,
malformed, partial, and unrecognized events cannot drive feedback.

Explicit “stop”, “skip”, “no thanks”, and “not now” end the ad. Negated and
incidental phrases such as “don't stop” or “does shipping stop on weekends?” do
not. This is a small deterministic English classifier, not universal language
understanding. Browser SpeechRecognition supplements final stop detection only;
Tavus's final user transcript handles other speech feedback.

## Product facts and follow-ups

`packages/core/src/fixtures/knicksGame.ts` owns the two demo products, short spoken
openings, and shared grounding policy. Internal context is never displayed as a
mock speech script. The generic provider context follows the same unknown-fact
and stop rules.

Known facts are deliberately narrow: the illustrative shoe name/color/category
and jersey name/team/category. Exact equipment identification, official licensing,
retail details, live game statistics, and offers are not verified. The supplied
policy asks the agent to answer directly in one or two sentences, use the prior
turn for follow-ups, admit unknowns, and avoid restarting the pitch.

A product question or explicit interested click enables up to 90 seconds from
first playable media. Later questions cannot reset that cap. Without explicit
engagement, the server's short duration plus an eight-second grace period applies.
Shortening feedback returns to an eight-second completion window. Skip/rejection
always overrides both timers and pending responses.

## Failure and teardown behavior

- Session request and response body: browser deadline of eight seconds. Provider
  fetch and JSON decoding share `PROVIDER_TIMEOUT_MS`. Ad-2 history retrieval has
  a two-second deadline. Failures produce a short scripted fallback.
- Daily connection/media: after 20 seconds without playable media, show the
  scripted fallback. Daily errors also select fallback.
- Local stop: mute/pause/detach audio synchronously. Daily leave cleanup has a
  two-second wait limit before destroy is attempted; it only touches the captured
  instance and cannot clear a newer call.
- Late session creation after cancellation is ignored. There is no authenticated
  remote end route; a server-created conversation can remain until Tavus's
  180-second limit. Browser silence is not a claim of remote session deletion.
- Strict Mode, reset, and unmount invalidate the old lifecycle. Pending feedback
  is allowed to finish storing, but cannot emit speech into a subsequent ad.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Scripted card instead of live media | Provider flags/IDs, session response provider, and Daily network/permissions |
| Agent cannot answer a retail question | The demo has no verified retail data; an honest unknown is correct |
| Buttons work but perception does not | Actual remote tool configuration and nested event properties |
| Voice text is wrong | Compare heard words with STT output in a temporary redacted diagnostic; do not persist it as a preference |
| Model ignores the supplied instructions | Inspect the remote persona prompt and conflicting policies before tuning local copy |
| Second ad does not start after a failed Skip write | Deliberate low-pressure behavior; Start Session resets the demo |

## Automated checks

`npm test` includes Vitest tests in web/core/integrations. The web suite mounts the
actual React page and panel using jsdom and simulated Daily/network boundaries.
It checks exact outgoing events, immediate local silence, two-question timing,
duplicate events, stale replies, loading cancellation, and fallback behavior.
The HTTP smoke script exercises real Next handlers with provider flags disabled.

These tests do not establish live speech correctness or acoustic quality.

## Live replay

Use one controlled live session, with the configured persona and microphone:

1. Confirm the illustrative product introduction; no discount, urgency, or false
   shipping claim should be spoken.
2. Ask “What product is this?” then “And what sizes are available?” The second
   answer should acknowledge unknown sizing and keep the same session open.
3. Click Tell me quickly; compare the audible answer with the displayed approved
   script. It should interrupt once and not restart a long pitch.
4. Click Skip during speech. Confirm silence and video resumption immediately,
   including with a slow feedback request. A later response must not reopen it.
5. Repeat with Tavus disabled; verify script-and-button completion.

For an answer-quality evaluation, use these 20 inputs. Grouped inputs are separate
cases, and expected behavior is listed beside each group:

| Cases | Inputs | Expected |
| --- | --- | --- |
| 1–4 | What is this? / What color is the shoe? / Which team is the jersey for? / Is this a real shop? | Supplied demo facts, explicit illustrative status |
| 5–10 | What does it cost? / What sizes? / Is it in stock? / When will it ship? / Is there a discount? / Where do I check out? | Honest unknown, no fabricated offer or link |
| 11–12 | What about the jersey? / And the price? | Resolve the product reference across turns |
| 13–16 | Too long / Tell me quickly / I'm annoyed / Not relevant | Shorten, de-escalate, or stop without pressure |
| 17–18 | Skip this / No thanks | Immediate local stop |
| 19–20 | Don't stop / Does shipping stop on weekends? | No false stop |

Target: all hard-stop and no-fabrication cases, plus at least 18/20 correct task
responses. Limit tuning to three replay rounds. Record observed outcomes and
latency separately. No live score has been established by the automated suite.
