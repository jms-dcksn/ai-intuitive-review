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
the model can't fabricate**: the Citations API returns, for each span of the
answer, the exact character range in the exact source document it was drawn from.
The UI then renders those ranges deterministically.

That single idea drives the whole example.

## The stack, and why it's split this way

Every example in this repo streams, using the **Vercel AI SDK** for the transport
and client so the UX is consistent across the set. But the *grounding* primitive —
the char offsets that make a citation trustworthy — lives in the **Anthropic
Citations API**. So the example draws a clean line:

- **Anthropic SDK** makes the grounded call and streams raw `text_delta` /
  `citations_delta` events. Its offsets are the thing we trust.
- **Vercel AI SDK** carries those to the browser: the server writes a UI message
  stream, the client reads it with `useChat`.

The join between them is [`SegmentWriter`](../examples/01-grounded-citations/lib/segment-writer.ts),
which translates Anthropic events into AI SDK message parts.

## Data flow

```
sample-data.ts ─┐
question ───────┤
                ▼
  /api/ask  createUIMessageStream({ execute })
                │
                ├─ mock?  streamMockAnswer() ─┐
                └─ live?  streamGroundedAnswer() ─► Anthropic Citations (stream)
                                              │        text_delta / citations_delta
                                              ▼
                                     SegmentWriter  ──►  writer.write(...)
                                              │      text-start/-delta/-end
                                              │      data-citation
                                              ▼
                       createUIMessageStreamResponse  ──(SSE)──►  useChat
                                                                     │
                             AnswerView (parts → text + [n] markers) │
                             SourcePane (highlight active span)  ◄── activeCitation
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

## Step 2 — The contract: a flat type + a typed message

[`lib/types.ts`](../examples/01-grounded-citations/lib/types.ts) defines the only
shape the UI ever sees for a citation:

```ts
interface Citation {
  n: number;          // the [1], [2] shown to the user
  docId: string;      // which source
  docTitle: string;
  citedText: string;  // exact quoted span (for the hover card)
  startChar: number;  // API-provided offset (for the highlight)
  endChar: number;
}
```

It also declares the **typed AI SDK message**:

```ts
export type ReviewDataParts = { citation: Citation; mode: { mocked: boolean } };
export type ReviewUIMessage = UIMessage<never, ReviewDataParts>;
```

That second type parameter is what makes streamed citations type-safe end to end:
on the client, a part with `type === "data-citation"` has `part.data: Citation`
with no casting.

## Step 3 — The grounded, streamed call

[`lib/anthropic.ts`](../examples/01-grounded-citations/lib/anthropic.ts) sends each
document as a `document` content block with `citations: { enabled: true }` and
streams the result:

```ts
const stream = client.messages.stream({
  model: MODEL,
  system: SYSTEM,
  messages: [{ role: "user", content: [
    ...docs.map((doc) => ({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: doc.text },
      title: doc.title,
      citations: { enabled: true },
    })),
    { type: "text", text: question },
  ]}],
});

for await (const event of stream) {
  if (event.type !== "content_block_delta") continue;
  if (event.delta.type === "text_delta")      out.text(event.delta.text);
  else if (event.delta.type === "citations_delta") out.citation(/* char_location */);
}
```

The system prompt does two jobs: *ground every claim*, and *prefer authoritative
policy/terms docs over informal notes/drafts* — the nudge that should keep the
model off the "two weeks" distractor.

The key streaming detail: `citations_delta` events arrive **interleaved** with the
text, right after the span they ground. A `char_location` citation carries
`cited_text`, `document_index`, `start_char_index`, and `end_char_index`. We map
`document_index` back to our `SourceDoc` and forward everything to the
`SegmentWriter` — we never trust a range the model wrote in prose, only the ones
the API attached to a delta.

## Step 4 — SegmentWriter: events → ordered parts

This is the subtle bit. If you stream all the text into one AI SDK text part and
then drop citation parts alongside it, the markers float loose — they lose their
position relative to the words. [`SegmentWriter`](../examples/01-grounded-citations/lib/segment-writer.ts)
fixes ordering by giving **each run of text its own `text-*` id** and closing the
current run whenever a citation arrives:

```ts
text(delta)  → if no open segment, write { type: "text-start", id: `s${seg}` }
               write { type: "text-delta", id: `s${seg}`, delta }
citation(sp) → flush()  // text-end for the current segment
               write { type: "data-citation", data: numbered(sp) }
```

The result is a parts array in exactly the produced order —
`[text][citation][text][citation]…` — which is what lets the UI render
`…cited sentence [1] next sentence [2]…` inline. `SegmentWriter` also owns
**footnote numbering**: identical spans (keyed `docId:start:end`) share one `n`
but still emit a marker at each position.

## Step 5 — The route: one stream, live or mock

[`app/api/ask/route.ts`](../examples/01-grounded-citations/app/api/ask/route.ts)
wraps it all in a UI message stream:

```ts
const stream = createUIMessageStream<ReviewUIMessage>({
  execute: async ({ writer }) => {
    writer.write({ type: "data-mode", data: { mocked }, transient: true });
    const out = new SegmentWriter(writer);
    mocked ? await streamMockAnswer(out, SAMPLE_DOCS)
           : await streamGroundedAnswer(out, question, SAMPLE_DOCS);
  },
});
return createUIMessageStreamResponse({ stream });
```

Two things worth noting:

- **`data-mode` is `transient`** — it reaches the client's `onData` callback (to
  toggle the mock banner) but is *not* added to `message.parts`, so it never
  pollutes the rendered answer.
- **The no-key path streams too.**
  [`lib/mock.ts`](../examples/01-grounded-citations/lib/mock.ts) replays a recorded
  answer word-by-word with small delays, resolving char offsets from the live
  sample text with `indexOf`. So the *streaming* UX is reviewable offline, and the
  mock emits byte-for-byte the same part shapes as the live path (same philosophy
  as `rlm-deep-agents`: the example demonstrates itself without credentials).

## Step 6 — The client: `useChat` + a custom transport

[`app/page.tsx`](../examples/01-grounded-citations/app/page.tsx) uses `useChat`
typed with `ReviewUIMessage`. Because the route expects a plain `{ question }`
rather than a message list, we shape the request with `prepareSendMessagesRequest`:

```ts
useChat<ReviewUIMessage>({
  transport: new DefaultChatTransport({
    api: "/api/ask",
    prepareSendMessagesRequest: ({ messages }) => {
      const text = lastUserText(messages);
      return { body: { question: text } };
    },
  }),
  onData: (part) => { if (part.type === "data-mode") setMocked(part.data.mocked); },
});
```

`status` (`submitted` / `streaming` / `ready`) drives the button label and the
blinking caret; the latest assistant message's `parts` drive the answer.

## Step 7 — Rendering the answer from parts

[`components/AnswerView.tsx`](../examples/01-grounded-citations/components/AnswerView.tsx)
walks `message.parts` in order:

- a `text` part renders inline;
- a `data-citation` part renders a `<CitationMarker>` (the `[n]`).

Ungrounded flagging is a first-class feature: a meaningful text run **not**
immediately followed by a citation is a claim with no source. But we only badge it
once streaming finishes (`streaming === false`) — mid-stream, a marker might simply
not have arrived yet, and we don't want to flash a false warning. Here the last
sentence — a helpful aside about the 14-day self-serve figure — is legitimately
not a direct quote, and the UI says so. Showing what *isn't* grounded builds as
much trust as showing what is.

## Step 8 — The citation marker

[`components/Citation.tsx`](../examples/01-grounded-citations/components/Citation.tsx)
is the atomic trust primitive: a keyboard-focusable `[n]` that shows the source
title + quoted span on hover and calls `onSelect` on click. It knows nothing about
the source pane — it just announces "this citation was chosen," which keeps it
reusable across every other example.

## Step 9 — Click-to-highlight attribution

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

`page.tsx` holds one piece of shared state — `activeCitation` — passed to both
panes. Clicking a marker sets it; the source pane reads it. That single lifted
value *is* the link between claim and evidence.

## What to take to the other examples

- **Ground in structure, not prose.** Any time the model asserts something a user
  must trust, look for an API/tool primitive that returns the evidence as data
  (ranges, IDs, tool results) instead of asking the model to describe it.
- **Stream typed data parts, not just text.** The `data-citation` pattern — a
  typed custom part interleaved with text — is the reusable spine of this repo.
  Examples 02 (finding trees), 04 (reasoning), and 06 (approval requests) all
  stream typed parts the same way.
- **Own the ordering.** The `SegmentWriter` trick (a new text id per run) is how
  you keep streamed annotations positioned correctly relative to the text.
- **Show the gaps.** Flagging ungrounded claims builds more trust than hiding them.
- **Make it stream without a key.** A recorded path that replays at real cadence
  keeps the UX honest and reviewable.
