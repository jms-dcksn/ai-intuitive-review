# 04 · Reasoning as Proof

The model's **extended thinking** streams into a separate, de-emphasized
reasoning channel while it works — proof-of-work you can watch — then collapses
to a one-line receipt the moment the answer lands. The working stays one click
away, labeled as the model's deliberation (not fact), and never visually
outranks the answer.

The trust question this answers: **"show your working, not just the answer."**

```
┌ MODEL REASONING · reasoned for 12s · 340 words ── show working ┐
└─────────────────────────────────────────────────────────────────┘
┌── Answer ───────────────────────┐   ┌── Scenario ──────────────┐
│ Yes — Brightline can terminate  │   │ MSA excerpts             │
│ for cause; refund $38,160.      │   │ §4.2 Service Credits …   │
│ — 5 × $7,200 = $36,000 (§9.2)   │   │ §4.3 Chronic Failure …   │
│ — 3 × $720  = $2,160  (§4.2)    │   │ Account file             │
└─────────────────────────────────┘   │ June 99.1% ← below SLA … │
   while thinking, the top pane        └──────────────────────────┘
   is a live, auto-scrolling ticker of the model's working
```

## Why it builds trust

A recommendation with money riding on it is hard to accept as a bare
conclusion. Watching the model check the chronic-failure clause, notice the
sole-remedy trap, and do the proration arithmetic turns an oracle into a
colleague — and because the trace stays inspectable next to the source
documents, "trust" means *spot-check the working*, not *take it on faith*.

Two rules keep it honest (see [`PLAN.md`](./PLAN.md)):

- **Never outrank the answer.** Live trace is a clipped ticker; on first answer
  token it auto-collapses to a receipt. Reasoning is labeled *deliberation, not
  verified fact* everywhere it appears.
- **Honest provenance.** Current Claude models return a **summarized** view of
  the reasoning (`display: "summarized"`), not the raw chain of thought — the
  receipt says so. If adaptive thinking skips reasoning on an easy question,
  the UI says "answered directly" instead of pretending.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Vercel AI SDK** (`ai` v5 + `@ai-sdk/react`) — `createUIMessageStream` on
  the server, `useChat` on the client, exactly like examples 01/03. The new
  element: the AI SDK's **first-class `reasoning` parts**
  (`reasoning-start/-delta/-end`), the native slot production chat UIs already
  render.
- **Anthropic SDK** — the model call with adaptive thinking. Streaming events
  map 1:1: `thinking_delta` → `reasoning-delta`, `text_delta` → `text-delta`.

The request uses the current thinking API:

```ts
thinking: { type: "adaptive", display: "summarized" }
```

(`budget_tokens` is removed on current models; `display` must be opted into —
the default `"omitted"` streams thinking blocks with *empty* text.)

## Run it

```bash
cd examples/04-reasoning-as-proof
npm install

cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

**No API key?** It still runs. `/api/reason` streams a recorded reasoning trace
and answer (`lib/mock.ts`) through the identical part shapes at a realistic
cadence, so the whole UX — ticker, auto-collapse, receipt — is reviewable
offline. A banner marks the mock.

## What to try

1. Press **Ask** with the default question. Watch the reasoning tick past in
   the muted pane — clause checks, then the arithmetic.
2. The moment the answer starts, the pane collapses to **"reasoned for Ns ·
   N words — show working."** The answer takes the stage.
3. Click **show working** and audit the trace against the documents on the
   right: the 3-consecutive-months check, 5 × $7,200, the §4.2/§4.3
   interaction.
4. Note what the receipt *admits*: the trace is a summarized view, and with a
   live key an easy question may produce no trace at all ("answered directly").
5. With a live key, ask something adjacent ("What if only two months had
   missed the SLA?") and watch the reasoning change shape.

## Files

| File | Role |
|------|------|
| `lib/sample-data.ts` | Contract excerpts + account file + default question |
| `lib/types.ts` | `data-meta` provenance part + typed `ReasonUIMessage` |
| `lib/anthropic.ts` | Adaptive-thinking stream → reasoning/text parts |
| `lib/mock.ts` | Recorded trace + answer, streamed (no-key path) |
| `app/api/reason/route.ts` | `createUIMessageStream` endpoint; live vs. mock |
| `components/ReasoningPane.tsx` | Live ticker → receipt → expandable working |
| `components/AnswerView.tsx` | The primary answer panel |
| `components/ScenarioPane.tsx` | Source documents for auditing the working |
| `app/page.tsx` | `useChat` shell + phase/timing state |

Full step-by-step:
[`../../walkthroughs/04-reasoning-as-proof.md`](../../walkthroughs/04-reasoning-as-proof.md).

## Notes & next steps

- **Why native `reasoning` parts, not a custom data part?** Examples 01–03
  minted custom `data-*` parts because their payloads (citations, decisions)
  have no AI SDK equivalent. Reasoning *does* — it's a first-class part type
  with the same start/delta/end lifecycle as text. Using the native slot means
  any AI-SDK-compatible chat surface renders this example's stream unmodified.
- **What the trace is, precisely.** With `display: "summarized"` you get a
  summarized view of the reasoning; the raw chain of thought is never returned
  by current models. The `data-meta` part carries that fact to the UI rather
  than letting the interface imply more than it has.
- **Signatures & multi-turn.** Thinking blocks carry signatures for replaying
  them back in multi-turn conversations. This example is single-turn, so
  `signature_delta` events are deliberately ignored — noted in
  `lib/anthropic.ts` for when someone extends it.
- **Relationship to 03.** This example shows *how the model thought*; example
  03 shows *what the agent decided* over a long run. Interleaved thinking
  between tool calls is where the two patterns meet in production.
