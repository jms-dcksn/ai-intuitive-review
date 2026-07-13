# Walkthrough 04 — Reasoning as Proof

> Code: [`examples/04-reasoning-as-proof`](../examples/04-reasoning-as-proof)

Examples 01–03 built trust from *artifacts*: citations, tiered findings, a
decision ledger. This one builds it from *process*. When a recommendation has
real stakes — here, whether a customer's termination is for-cause and exactly
how much to refund — a bare conclusion demands blind trust. The model's
extended-thinking stream, rendered as a separate channel, turns the conclusion
into the last line of a visible derivation. That's proof-of-work: the user
watched the clause get checked and the arithmetic get done.

The pattern has a sharp edge, though. Reasoning that *vanishes* is theater;
reasoning that *dominates* is noise. The whole example is about ranking the two
channels correctly over time.

## The core idea: two channels, one message, ranked by the UI

Extended thinking gives you the model's working and its answer as **separate
content blocks in one response** — `thinking` blocks stream before `text`
blocks. The UI's job is to keep them separate and rank them:

| | While thinking | After the answer starts |
|---|---|---|
| Reasoning | live, clipped, auto-scrolling ticker (the proof-of-work moment) | collapsed to a receipt: *"reasoned for 12s · 340 words — show working"* |
| Answer | placeholder | the primary panel |

Collapsed-by-default is the rule *after* streaming; during streaming, showing
the trace live is the point. The transition is automatic — the first answer
token collapses the reasoning pane, so the user never has to demote it
themselves.

## Step 1 — The input: a scenario where the working matters

[`lib/sample-data.ts`](../examples/04-reasoning-as-proof/lib/sample-data.ts) is
a contract + account file engineered so the reasoning has visible texture:

- three consecutive SLA misses trigger a **chronic-failure clause** (§4.3) that
  deems the breach incurable and carves through the credits-are-the-sole-remedy
  clause (§4.2) — the judgment call;
- for-cause termination (§9.2) is effective at month-end, so the refund is
  5 × $7,200 = **$36,000**, plus 3 × $720 = **$2,160** in accrued credits — the
  arithmetic;
- a decoy path (termination for convenience, §9.1) that a lazy reading lands
  on, worth ~$17,600 less.

Every number the trace cites is checkable against the documents rendered in the
right-hand pane — proof-of-work only counts as proof if it can be audited.

## Step 2 — The live call: adaptive thinking, mapped to native parts

[`lib/anthropic.ts`](../examples/04-reasoning-as-proof/lib/anthropic.ts) makes
one streaming call:

```ts
client.messages.stream({
  model: MODEL,
  thinking: { type: "adaptive", display: "summarized" },
  system: SYSTEM,
  messages: [{ role: "user", content: `${material}\n\n=== QUESTION ===\n${question}` }],
});
```

Two current-API details are load-bearing:

- **`type: "adaptive"`** — the fixed `budget_tokens` thinking config is gone
  from current models (it 400s). Adaptive thinking lets the model decide when
  and how much to think, which also means an easy question may produce *no*
  thinking block — the UI handles that honestly ("answered directly").
- **`display: "summarized"`** — the default is `"omitted"`, which still streams
  thinking blocks but with **empty text**. You must opt in to get a readable
  trace, and what you get is a summarized view of the reasoning, not the raw
  chain of thought. The example surfaces that in the receipt rather than
  overstating what the trace is.

The event mapping is mechanical, which is the appeal:

```
content_block_start (thinking)      → writer.write({ type: "reasoning-start", id })
content_block_delta (thinking_delta)→ writer.write({ type: "reasoning-delta", id, delta })
content_block_start (text)          → writer.write({ type: "text-start", id })
content_block_delta (text_delta)    → writer.write({ type: "text-delta", id, delta })
content_block_stop                  → reasoning-end / text-end
```

`signature_delta` events are ignored (signatures matter only when replaying
thinking blocks in multi-turn conversations); a `redacted_thinking` block flips
a flag instead of faking a trace.

## Step 3 — Why native `reasoning` parts, not a custom data part

Examples 01–03 minted custom `data-citation` / `data-decision` parts because
those payloads have no AI SDK equivalent. Reasoning does: the AI SDK's
`UIMessage` has a first-class `{ type: "reasoning", text, state }` part with
the same start/delta/end stream lifecycle as text. Using the native slot buys
two things:

1. the client-side plumbing is identical to text — no reducer, no custom types
   for the channel itself;
2. any AI-SDK-compatible chat surface (assistant-ui, Agent Chat UI) renders
   this stream's reasoning in its own reasoning slot, unmodified.

The one custom part is `data-meta`
([`lib/types.ts`](../examples/04-reasoning-as-proof/lib/types.ts)), emitted
once at the end: the model id, the fact that the trace is summarized, and
whether anything was redacted — provenance only the server knows. Duration and
word count are computed client-side.

## Step 4 — The client: phase, not just parts

[`app/page.tsx`](../examples/04-reasoning-as-proof/app/page.tsx) derives
everything from the message parts plus stream status:

```ts
const reasoningText = parts.filter(p => p.type === "reasoning").map(p => p.text).join("\n\n");
const answerText    = parts.filter(p => p.type === "text").map(p => p.text).join("");

const phase = !assistant && !streaming ? "idle"
  : streaming && !answerText ? "thinking"     // reasoning ticker live
  : streaming ? "answering"                    // answer streaming, reasoning collapsed
  : "done";
```

The `thinking → answering` transition *is* the UX: a `useEffect` in
[`ReasoningPane`](../examples/04-reasoning-as-proof/components/ReasoningPane.tsx)
watches the phase and collapses exactly once when it leaves `thinking`, so the
user can re-expand afterwards without the pane fighting them. The pane also
freezes the timing receipt at that boundary — first reasoning token to first
answer token, measured with the client's wall clock, which is honest enough for
a receipt.

## Step 5 — The reasoning pane's three states

1. **Thinking** — a pulsing dot, a live word count, and a `max-height` viewport
   pinned to the newest line with a faded top edge. It reads as work scrolling
   past, not a document to read. A persistent caption labels it: *the model's
   private working — deliberation, not verified fact.*
2. **Receipt** (collapsed) — one line: duration, word count, provenance
   (*summarized by the API · model id*, or *recorded trace* in mock mode), and
   a `show working` affordance. This is what "collapsed by default, never
   outranking the answer" looks like concretely.
3. **Expanded** — the full trace in the same muted styling, with the
   disclaimer repeated and a pointer at the source pane. If the API withheld
   any reasoning (`redacted_thinking`), a line says so.

There's a fourth, honest state: if adaptive thinking produced no trace at all,
the pane says *"answered directly — no extended reasoning was needed"* instead
of pretending.

## Step 6 — Running without a key

[`lib/mock.ts`](../examples/04-reasoning-as-proof/lib/mock.ts) streams a
recorded trace and answer through the same `reasoning-*`/`text-*` chunks at a
realistic cadence — reasoning slightly faster than the answer, a beat between
the channels. The recorded trace is written the way a summarized thinking
stream reads (clause check → cure-period check → sole-remedy objection →
arithmetic → decoy-path sanity check → conclusion), and its `data-meta` says
`recorded-mock` so the receipt never claims a model that didn't run. Same
philosophy as 01–03: the demo demonstrates itself, streaming and all, with no
credentials.

## What to take to the other examples

- **Rank channels over time, not just in space.** The reasoning pane is above
  the answer, yet subordinate — because *when* it commands attention (during
  work) and *when* it yields (on first answer token) is designed.
- **Label epistemic status.** Reasoning is deliberation; it may explore wrong
  paths. Saying so — persistently, not in a tooltip — is what makes showing it
  safe.
- **Don't overstate provenance.** Summarized trace, possibly no trace,
  possibly redacted: the API tells you what you actually have, and the UI
  should pass that on. A trust pattern that inflates its own evidence defeats
  itself.
- **Prefer the platform's native slots.** When the streaming layer has a
  first-class type for your channel, use it — portability across chat surfaces
  is part of the payoff.
