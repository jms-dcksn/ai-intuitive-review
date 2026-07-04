# 01 · Grounded Citations

The smallest end-to-end trust loop: an answer that **streams in**, every claim
grounded in a source you can inspect. Inline `[n]` markers pop in after the
sentence they ground; hover shows the exact quoted span, click highlights that
span in the source document. Claims with **no** source are flagged `ungrounded`.

The trust question this answers: **"where did this specific claim come from?"**

```
┌── Answer ──────────────────┐   ┌── Sources ─────────────────┐
│ Enterprise plans have a    │   │ Refund Policy (v4)         │
│ 30-day refund window …[1]  │──►│ …Enterprise plans have a   │
│ It requires CSM sign-off   │   │ ▓▓30-day refund window▓▓…  │
│ …[2], and after the window │   │                            │
│ fees are non-refundable[3] │   │ Enterprise Terms & Cond.   │
│ (14-day is self-serve      │   │ …                          │
│ only) [ungrounded]         │   │                            │
└────────────────────────────┘   └────────────────────────────┘
   click [1]  ─────────────────►  scrolls + highlights the span
```

## Why it's trustworthy

The citation offsets (`startChar`/`endChar`) come from the **Anthropic Citations
API**, computed against the exact document text we sent — not from `[1]` markers
the model wrote into its prose. That's the whole point: the model can't
hallucinate a citation range, because it never writes the range. The UI just
renders what the API grounded.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Vercel AI SDK** (`ai` v5 + `@ai-sdk/react`) — the streaming transport and
  client. The server builds a UI message stream with `createUIMessageStream`; the
  client consumes it with `useChat`.
- **Anthropic SDK** — the grounded call itself, streamed with the Citations API.

The answer streams as ordinary AI SDK `text` parts; each grounded citation streams
as a **typed custom data part** (`data-citation`) carrying the full citation. We
keep the *model call* on the Anthropic SDK because its streaming `citations_delta`
events give the exact, verifiable char offsets — and hand those to the AI SDK
stream. So the transport and UI are Vercel AI SDK; the grounding stays native.
(A provider-native alternative — `streamText` with `@ai-sdk/anthropic` and its
`source` parts — is noted at the bottom.)

## Run it

```bash
cd examples/01-grounded-citations
npm install

cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

**No API key?** It still runs. The `/api/ask` route streams a recorded sample
answer (`lib/mock.ts`) at a realistic cadence — so you see the *streaming* UX, not
a static blob — the same "constructs/replays without a key" trick used in
`rlm-deep-agents`. A banner tells you when you're seeing the mock.

## What to try

1. Press **Ask** with the default question — watch the answer stream in and the
   `[n]` markers appear *after* the sentences they ground.
2. Hover `[1]` → see the source title + quoted span.
3. Click `[1]` → the right pane scrolls and highlights that exact span.
4. Note the last sentence is badged **ungrounded** once streaming settles — the
   model added a helpful aside that isn't directly quoted, and the UI shows that.
5. Edit the question (e.g. ask about *self-serve* refunds) and watch the
   citations move.

## Files

| File | Role |
|------|------|
| `lib/sample-data.ts` | The small, known corpus + default question |
| `lib/types.ts` | Flat `Citation` type + the typed `ReviewUIMessage` |
| `lib/anthropic.ts` | Streamed Citations API call → `SegmentWriter` |
| `lib/segment-writer.ts` | Turns text/citation events into ordered AI SDK parts |
| `lib/mock.ts` | Recorded answer, streamed, for the no-key path |
| `app/api/ask/route.ts` | `createUIMessageStream` endpoint; picks live vs. mock |
| `components/Citation.tsx` | The `[n]` marker + hover card |
| `components/AnswerView.tsx` | Renders message parts + ungrounded flagging |
| `components/SourcePane.tsx` | Verbatim sources + click-to-highlight |
| `app/page.tsx` | `useChat` split-view shell + state |

A full step-by-step is in
[`../../walkthroughs/01-grounded-citations.md`](../../walkthroughs/01-grounded-citations.md).

## Notes & next steps

- **Why a custom data part, not `@ai-sdk/anthropic` `source` parts?** The
  provider-native path (`streamText` + the Anthropic provider, reading `source`
  parts) also works. We stream citations as our own typed `data-citation` part
  instead, for two reasons: it keeps the exact, verifiable char offsets from the
  Citations API under our control, and it makes the live and mock paths emit an
  identical shape. The `useChat`/streaming half is unchanged either way.
- **Provider-agnostic fallback.** If you can't use the Citations API at all, have
  the model emit `{claim, source_id, quote}` JSON and fuzzy-match `quote` back to
  a char offset yourself. The UI layer (`Citation` / `SourcePane`) doesn't change.
- **Scaling to long docs.** Example 05 takes this same idea to full PDFs with
  page coordinates and a scrollable highlight overlay.
