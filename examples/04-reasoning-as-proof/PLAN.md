# Example 04 (plan) — Reasoning as Proof

> The design decisions of record for this example, agreed before the code. The
> top-level [README](../../README.md) sketch ("stream `thinking_delta` vs
> `text_delta` into different panes") is the seed; this pins the scenario, the
> exact UX rules, and the current-API details.

## The trust question

**"Show your working, not just the answer."** An AI recommendation with real
stakes — money, a legal position, a go/no-go — is hard to trust as a bare
conclusion. The model's reasoning stream turns an oracle into a colleague: you
can watch it check the clause, do the arithmetic, catch the edge case. That's
proof-of-work, and it changes how much verification the human feels they owe.

Two failure modes to avoid, though:

1. **Reasoning as decoration.** If the trace streams by and vanishes, it's
   theater. It must be *inspectable after the fact* — collapsible, reopenable,
   auditable against the source material.
2. **Reasoning as noise.** If the trace visually outranks the answer, the user
   reads a wall of deliberation instead of a recommendation. The reasoning must
   be de-emphasized, clearly labeled as the model's working (not verified fact),
   and must yield the stage the moment the answer arrives.

## Scenario

A judgment call *plus* a calculation, so the reasoning has visible texture —
clause interpretation interleaved with arithmetic the user can check:

> Brightline Logistics prepaid **$86,400** for an annual SaaS subscription
> (Mar 1 – Feb 28). Uptime missed the 99.5% SLA three consecutive months
> (June 99.1%, July 98.7%, August 99.3%). On September 10 they gave notice to
> terminate. **Can they terminate for cause, and exactly what do we refund?**

The contract (in `lib/sample-data.ts`) plants the load-bearing details:

- a **chronic-failure clause** — three consecutive SLA misses = material breach
  *not subject to cure* (so the 30-day cure period doesn't rescue the provider);
- **for-cause termination** — pro-rata refund of unused term, effective at
  month-end after notice → Oct–Feb = 5 × $7,200 = **$36,000**;
- **service credits** — 10% of the monthly fee per missed month, already
  accrued → 3 × $720 = **$2,160**;
- a **sole-and-exclusive-remedy clause** on credits, which superficially
  conflicts with terminating over SLA misses — the judgment call the reasoning
  has to work through (the chronic-failure clause explicitly carves through it);
- a decoy: the **for-convenience path** (60 days' notice, whole unused months,
  15% early-termination charge → $18,360) that a lazy read would land on.

A correct answer is ~$38,160 for cause vs ~$20,520 for convenience — an
$17,600 difference that rides entirely on reading two clauses correctly. That's
why the working matters.

## UX rules (the actual pattern)

1. **Two channels, visually ranked.** Reasoning renders in a muted, bordered
   pane *above* the answer; the answer is the primary panel. The reasoning pane
   never grows past a clipped viewport (auto-scrolling, faded top edge) while
   streaming — it reads as a ticker of work, not a document.
2. **Label it as working, not fact.** The pane header says "model reasoning"
   and carries a persistent disclaimer. Reasoning text is the model's private
   deliberation — it can explore wrong paths, and that's fine *if labeled*.
3. **Auto-collapse on answer.** The moment the first answer token arrives, the
   reasoning pane collapses to a one-line receipt — "Reasoned for 12s · 240
   words · show working" — and the answer takes the stage. Expanding it back is
   one click. Collapsed-by-default *after* streaming is the rule; *during*
   streaming, showing the live trace is the point (that's the proof-of-work).
4. **Auditable against sources.** The scenario documents (contract excerpts +
   case facts) sit in a right-hand pane, so every number and clause the
   reasoning cites can be checked without leaving the page.
5. **Honest provenance.** Current Claude models return a **summarized** view of
   reasoning (`display: "summarized"`), not the raw chain of thought. The UI
   says so in the receipt — overstating what the trace *is* would itself be a
   trust failure. Same for the no-thinking case: adaptive thinking may skip
   reasoning on easy questions, and the UI says "answered directly" rather than
   pretending.

## Tech approach

Same spine as 01/03: **Next.js + Vercel AI SDK (`useChat` +
`createUIMessageStream`) + Anthropic SDK**. The new element vs 01–03 is that
the AI SDK has a **first-class `reasoning` part type** — `reasoning-start` /
`reasoning-delta` / `reasoning-end` stream chunks that land as
`{type: "reasoning", text, state}` parts on the message, exactly parallel to
`text-*`. So no custom data part is needed for the reasoning channel; we use
the native slot, which is what production chat UIs (assistant-ui, Agent Chat
UI) key off too.

- **Live path** (`lib/anthropic.ts`): `client.messages.stream` with
  `thinking: {type: "adaptive", display: "summarized"}` — the current API;
  `budget_tokens` is removed on today's models, and `display` must be opted
  into because the default (`"omitted"`) streams thinking blocks with empty
  text. Streaming events map 1:1:
  - `content_block_start (thinking)` → `reasoning-start`
  - `content_block_delta (thinking_delta)` → `reasoning-delta`
  - `content_block_start (text)` → `text-start`, `text_delta` → `text-delta`
  - `signature_delta` is ignored (single-turn; signatures matter only when
    replaying thinking blocks back), `redacted_thinking` flips a flag.
- **One typed data part** (`data-meta`) at the end of the stream carries what
  only the server knows: the model id, that the trace is summarized, and
  whether any reasoning was redacted. The client computes duration and word
  count itself.
- **Mock path** (`lib/mock.ts`): a recorded reasoning trace + answer for the
  canned scenario, streamed word-by-word at realistic cadence through the same
  part shapes — the no-key demo shows the identical UX, per repo convention.

## Files

| File | Role |
|------|------|
| `lib/sample-data.ts` | Contract excerpts + case facts + default question |
| `lib/types.ts` | `data-meta` part + typed `ReasonUIMessage` |
| `lib/anthropic.ts` | Streamed adaptive-thinking call → reasoning/text parts |
| `lib/mock.ts` | Recorded reasoning + answer, streamed (no-key path) |
| `app/api/reason/route.ts` | `createUIMessageStream` endpoint; live vs mock |
| `components/ReasoningPane.tsx` | Live ticker → collapsed receipt → expandable working |
| `components/AnswerView.tsx` | The primary answer panel |
| `components/ScenarioPane.tsx` | Contract + case facts for auditing the working |
| `app/page.tsx` | `useChat` shell + reasoning phase/timing state |

## Non-goals

- No multi-turn: one question, one reasoned answer. (Replaying thinking blocks
  with signatures across turns is a real topic, but not this example's.)
- No judge layer (01 has that); no tool use during thinking (interleaved
  reasoning between tool calls is example 03's territory conceptually).
