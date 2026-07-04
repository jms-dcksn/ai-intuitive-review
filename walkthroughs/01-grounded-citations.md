# Walkthrough 01 — Grounded Citations

> Code: [`examples/01-grounded-citations`](../examples/01-grounded-citations)

This walkthrough explains *how* the example works and, more importantly, *why*
each decision is the one that produces trust rather than the appearance of it.

## The core problem

If you ask a model to write citations into its own prose — "add a `[1]` after
each fact and list the sources at the bottom" — the citation numbers, the source
titles, and even the quoted text are all just *more generated tokens*. The model
can, and does, invent them. A confident-looking `[1]` that points at nothing is
worse than no citation, because it manufactures trust it hasn't earned.

The fix is to move the grounding out of the prose and into a **structured layer
the model can't fabricate**: the API returns, for each span of the answer, the
exact character range in the exact source document it was drawn from. The UI then
renders those ranges deterministically.

That single idea drives the whole example.

## Data flow

```
sample-data.ts ─┐
                ├─► /api/ask ─► askWithCitations() ─► Anthropic Citations API
question ───────┘                     │
                                      ▼
                        narrow(): provider blocks ─► flat AskResponse
                                      │
                                      ▼
        page.tsx ──► AnswerView (markers)  +  SourcePane (highlight)
                          ▲                          │
                          └──── activeCitation ◄─────┘
```

## Step 1 — The input: a small, *known* corpus

[`lib/sample-data.ts`](../examples/01-grounded-citations/lib/sample-data.ts)
defines three short documents and one question. This is deliberate:

- **The answer is split across two docs** (the 30-day window lives in the Refund
  Policy; the "non-refundable after the window" condition lives in the Enterprise
  Terms). Grounding has to pull from both.
- **There's a distractor** — a support thread where an agent guesses "two weeks"
  and an internal note warns *not* to quote 14 days to Enterprise. A model that
  pattern-matches on "refund + number" can trip here; a grounded one shouldn't.

Because the corpus is small and fixed, you can verify the demo by eye: does the
highlight land on the sentence that actually supports the claim?

## Step 2 — The contract: a flat schema

[`lib/types.ts`](../examples/01-grounded-citations/lib/types.ts) defines the only
shape the UI ever sees:

```ts
interface Citation {
  n: number;          // the [1], [2] shown to the user
  docId: string;      // which source
  docTitle: string;
  citedText: string;  // exact quoted span (for the hover card)
  startChar: number;  // API-provided offset (for the highlight)
  endChar: number;
}
interface AnswerBlock { text: string; citations: Citation[] }
```

Keeping this flat and provider-neutral is what lets every later example reuse the
same `<Citation>` and `<SourcePane>` primitives — the messy provider shape stops
at the API route.

## Step 3 — The grounded call

[`lib/anthropic.ts`](../examples/01-grounded-citations/lib/anthropic.ts) sends
each document as a `document` content block with `citations: { enabled: true }`:

```ts
content: [
  ...docs.map((doc) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: doc.text },
    title: doc.title,
    citations: { enabled: true },
  })),
  { type: "text", text: question },
]
```

The system prompt does two jobs: *ground every claim*, and *prefer authoritative
policy/terms docs over informal notes/drafts* — the nudge that should keep the
model off the "two weeks" distractor.

The response comes back as content blocks. Text blocks carry a `citations` array,
and for text documents each entry is a `char_location`:

```jsonc
{
  "type": "char_location",
  "cited_text": "Enterprise plans have a 30-day refund window from the invoice date.",
  "document_index": 0,
  "start_char_index": 63,
  "end_char_index": 129
}
```

`narrow()` walks those blocks and:

1. maps `document_index` back to our `SourceDoc` (so we get a stable `docId`),
2. **de-dupes identical spans** via a `docId:start:end` key so the same source
   shares one footnote number, and
3. assigns each unique span a 1-based `n`.

The output is a flat `AskResponse` — blocks in reading order, plus a numbered
citation registry.

## Step 4 — The no-key path

[`lib/mock.ts`](../examples/01-grounded-citations/lib/mock.ts) returns a recorded
answer when `ANTHROPIC_API_KEY` is unset, so the UX is reviewable offline. It
computes char offsets from the live sample text with `indexOf`, so the highlights
stay correct even if you edit the sample copy. A banner marks the mock so no one
mistakes it for a live grounded answer. (Same philosophy as `rlm-deep-agents`:
the example should *construct and demonstrate itself* without credentials.)

## Step 5 — Rendering the answer

[`components/AnswerView.tsx`](../examples/01-grounded-citations/components/AnswerView.tsx)
renders each block's text, then either:

- its citation markers (grounded block), or
- an **`ungrounded` badge + dashed underline** (a claim with no citation).

Surfacing the ungrounded claim is a first-class feature, not an afterthought. A
reviewer's trust comes as much from *seeing what isn't backed by a source* as
from seeing what is. Here the last sentence — a helpful aside about the 14-day
self-serve figure — is legitimately not a direct quote, and the UI says so.

## Step 6 — The citation marker

[`components/Citation.tsx`](../examples/01-grounded-citations/components/Citation.tsx)
is the atomic trust primitive: a keyboard-focusable `[n]` that shows the source
title + quoted span on hover and calls `onSelect` on click. It knows nothing
about the source pane — it just announces "this citation was chosen," which keeps
it reusable across every other example.

## Step 7 — Click-to-highlight attribution

[`components/SourcePane.tsx`](../examples/01-grounded-citations/components/SourcePane.tsx)
renders every document verbatim. When a citation is active, it slices the source
text at `[startChar, endChar]`, wraps the middle in `<mark>`, and scrolls it into
view:

```tsx
{text.slice(0, start)}
<mark ref={markRef}>{text.slice(start, end)}</mark>
{text.slice(end)}
```

Because `start`/`end` came from the API against the *same* text we're rendering,
the highlight is exact — no fuzzy matching needed. (When the source is a chunked
PDF whose rendered text drifts from what was embedded, you *do* need fuzzy
matching; that's example 05's problem, not this one's.) Offsets are clamped
defensively so a bad range can never throw.

## Step 8 — Wiring state

[`app/page.tsx`](../examples/01-grounded-citations/app/page.tsx) holds one piece
of shared state — `activeCitation` — and passes it to both panes. Clicking a
marker in `AnswerView` sets it; `SourcePane` reads it to decide what to
highlight. That single lifted value *is* the link between claim and evidence.

## What to take to the other examples

- **Ground in structure, not prose.** Any time the model asserts something a user
  must trust, look for an API/tool primitive that returns the evidence as data
  (ranges, IDs, tool results) instead of asking the model to describe it.
- **Show the gaps.** Flagging ungrounded claims builds more trust than hiding
  them.
- **Keep the provider shape at the edge.** Narrow to a flat schema in the route so
  the UI primitives stay reusable.
- **Make it run without a key.** A recorded path keeps the UX reviewable and the
  example honest about what's live vs. canned.
