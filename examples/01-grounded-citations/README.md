# 01 · Grounded Citations

The smallest end-to-end trust loop: an answer whose every claim is grounded in a
source you can inspect. Inline `[n]` markers hover to show the exact quoted span
and click to highlight that span in the source document. Claims with **no** source
are flagged `ungrounded`.

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

## Run it

```bash
cd examples/01-grounded-citations
npm install

cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

**No API key?** It still runs. The `/api/ask` route falls back to a recorded
sample answer (`lib/mock.ts`) so you can review the UX offline — the same
"constructs/replays without a key" trick used in `rlm-deep-agents`. A banner tells
you when you're seeing the mock.

## What to try

1. Press **Ask** with the default question.
2. Hover `[1]` → see the source title + quoted span.
3. Click `[1]` → the right pane scrolls and highlights that exact span.
4. Note the last sentence is badged **ungrounded** — the model added a helpful
   aside that isn't directly quoted from a doc, and the UI makes that visible.
5. Edit the question (e.g. ask about *self-serve* refunds) and watch the
   citations move.

## Files

| File | Role |
|------|------|
| `lib/sample-data.ts` | The small, known corpus + default question |
| `lib/types.ts` | Flat `Citation` / `AnswerBlock` schema shared by API + UI |
| `lib/anthropic.ts` | Citations API call + narrowing to the flat schema |
| `lib/mock.ts` | Recorded answer for the no-key path |
| `app/api/ask/route.ts` | POST endpoint; picks live vs. mock |
| `components/Citation.tsx` | The `[n]` marker + hover card |
| `components/AnswerView.tsx` | Answer blocks + ungrounded flagging |
| `components/SourcePane.tsx` | Verbatim sources + click-to-highlight |
| `app/page.tsx` | The split-view shell + state |

A full step-by-step is in
[`../../walkthroughs/01-grounded-citations.md`](../../walkthroughs/01-grounded-citations.md).

## Notes & next steps

- **Streaming.** This example is non-streaming for clarity — grounding, not
  streaming, is the point here. Streamed reasoning is covered in example 04.
- **Provider-agnostic fallback.** If you can't use the Citations API, have the
  model emit `{claim, source_id, quote}` JSON and fuzzy-match `quote` back to a
  char offset yourself. The UI layer (`Citation` / `SourcePane`) doesn't change.
- **Scaling to long docs.** Example 05 takes this same idea to full PDFs with
  page coordinates and a scrollable highlight overlay.
