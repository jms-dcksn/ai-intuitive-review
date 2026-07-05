# 02 · Progressive Disclosure

A tiered agent report that **streams in top-down** and stays **collapsed by
default**. The verdict resolves first, then findings pop in one at a time. Each
finding is a card: a one-line summary you can scan, an expand for the reasoning,
and one more level down for the raw evidence.

The trust question this answers: **"show me more — but only when I ask."**

```
┌───────────────────────────────────────────────┐
│ [APPROVE WITH CONDITIONS]  confidence: medium  │  ← tier 0 (always on)
│ Strong security baseline, but close the data-  │
│ residency and incident gaps first.             │
└───────────────────────────────────────────────┘
 Findings (5)
 ▶ Unresolved P1 near-miss…              [critical]  ← tier 1 (collapsed)
 ▼ US-only data residency…              [caution ]
     A short paragraph of reasoning…               ← tier 2 (on expand)
     [ Show evidence (2) ]
       • DPA §7 — "…solely within the US…"          ← tier 3 (one level deeper)
       • Questionnaire — "no EU option"
 ▶ Off-list subprocessor…               [caution ]
 ▶ Clean SOC 2 Type II…                 [positive]
 ▶ Solid encryption baseline…           [positive]
```

## Two axes of "reveal"

- **Streaming** controls what the *model* has revealed so far (top-down, as it
  generates).
- **Disclosure** controls what *you* choose to see (expand / show-evidence).

They're complementary: even after streaming finishes, the default view stays
scannable because depth is opt-in. That's the whole trust idea — the user is
never buried, and never blocked from the underlying facts.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Vercel AI SDK** structured-object streaming: `streamObject` (server) +
  `experimental_useObject` (client), typed by a **Zod** schema.
- **`@ai-sdk/anthropic`** as the model provider.

This is the generative-UI counterpart to example 01. Where 01 streamed text with
typed custom **data parts**, 02 streams a **partial object** — the client's
`useObject` runs a partial-JSON parser and re-renders the tree as fields arrive.
The disclosure cards are hand-rolled accessible `<button aria-expanded>` regions
(Radix/shadcn `Collapsible` is the drop-in production swap).

## Run it

```bash
cd examples/02-progressive-disclosure
npm install

cp .env.example .env.local     # add your ANTHROPIC_API_KEY (+ optional ASSESS_MODEL)
npm run dev                     # http://localhost:3000
```

**No API key?** It still runs. `/api/assess` streams a recorded report
(`lib/sample-data.ts`) as sliced JSON at a realistic cadence, so the streaming
*and* disclosure UX are fully reviewable offline. A banner marks the mock.

## What to try

1. Press **Assess vendor** — watch the verdict land first, then findings stream
   in, most decision-relevant (critical) first.
2. Note everything is collapsed. Expand the top finding → its reasoning (tier 2).
3. Click **Show evidence** → the raw quoted material behind it (tier 3).
4. Re-run and interrupt your reading: the summaries alone are enough to decide,
   which is the point.

## Files

| File | Role |
|------|------|
| `lib/schema.ts` | The Zod tier tree (`verdict` → `findings[]` → `detail` → `evidence[]`) |
| `lib/sample-data.ts` | Raw vendor material, the task, and the recorded report |
| `lib/assess.ts` | `streamObject` call against `@ai-sdk/anthropic` |
| `lib/mock.ts` | Streams the recorded report as sliced JSON (no-key path) |
| `app/api/assess/route.ts` | `POST` streams the object; `GET` reports mock vs. live |
| `components/ReportView.tsx` | Tier 0 verdict + the tier-1 card list |
| `components/FindingCard.tsx` | One finding with tier-2 / tier-3 disclosure |
| `app/page.tsx` | `useObject` shell + mock banner |

Full step-by-step:
[`../../walkthroughs/02-progressive-disclosure.md`](../../walkthroughs/02-progressive-disclosure.md).

## Notes & next steps

- **Why `streamObject`, not custom data parts?** A report *is* a nested object, so
  streaming it as one partial object (and letting `useObject` re-render the tree)
  is simpler and more honest than hand-threading dozens of `data-*` parts. Pick
  the AI SDK primitive that matches the shape of your data: text-with-annotations
  → data parts (01); a structured tree → `streamObject` (02).
- **The schema is the design.** Because the tiers are schema fields, the model is
  *forced* to tier its output — it can't dump a wall of text even if it wants to.
- **Severity ordering** is a prompt instruction, not UI sorting, so the most
  decision-relevant finding streams in first and the scannable default is useful
  immediately.
