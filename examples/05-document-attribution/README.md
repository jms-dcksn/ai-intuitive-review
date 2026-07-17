# 05 · Document Attribution & Highlighting

**The trust question:** *"Jump me to the exact place in the source."*

An agent reads Chegg's real FY2025 Form 10-K — ~370K characters pulled from SEC
EDGAR and committed to this repo — and finds every statement attributing
business risk, competitive pressure, or revenue decline to generative AI.
Findings stream into the left panel; the actual filing renders on the right.
Clicking a finding scrolls the document to the exact cited span and highlights
it; a minimap shows where all the evidence lives in the filing at a glance.

This is [example 01](../01-grounded-citations) (grounded citations) scaled up
to a long document, where **navigation is the trust feature**. See
[`PLAN.md`](./PLAN.md) for the design decisions — including why this renders
the filing's native EDGAR HTML instead of the README's original PDF sketch.

## Run it

```bash
npm install
npm run dev   # → http://localhost:3000, no API key needed
```

Click **Run analysis**. The app replays a recorded analysis run
(`lib/findings.json`) — the expensive grounded call happens offline, once.

## What to look at

- **Click a finding** → the 10-K scrolls to the exact sentence, painted via the
  CSS Custom Highlight API. The card shows the verbatim quote and its section
  breadcrumb, so you compare claim vs. source before and after the jump.
- **The minimap** — one marker per finding at its true position in the filing,
  colored by category. The evidence visibly clusters in Item 1A (Risk Factors)
  and Item 7 (MD&A), which is itself a credibility signal.
- **"Show all spans"** — paints every cited span at once, turning the document
  into a marked-up copy of the filing.
- **Honest anchoring** — a quote that can't be located in the rendered document
  gets a visible "span not located" badge, never a fake highlight.

## How the grounding works

1. `scripts/fetch-10k.mjs` downloads the pinned filing from EDGAR
   (accession `0001364954-26-000021`); the copy in `data/` is committed.
2. `scripts/extract-text.mjs` produces canonical plain text whose
   non-whitespace characters match what the browser renders, plus a map of
   Item-heading offsets for section labels.
3. `scripts/generate-findings.mjs` makes **one Citations API call** with the
   full text as a plain-text document block (`citations: {enabled: true}`,
   ~93K input tokens — the whole 10-K fits in context, so no chunking or
   vector store). Quotes are never model-authored: they're `cited_text` +
   char ranges computed by the API. Output: `lib/findings.json`.
4. In the browser, `lib/anchor.ts` resolves each quote to a DOM Range with a
   whitespace-insensitive search over the rendered filing, and paints it with
   the CSS Custom Highlight API — no DOM mutation of the 2MB document.

## Regenerate the analysis

```bash
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run fetch-10k            # optional: re-pull from EDGAR
npm run extract
npm run generate             # one ~93K-token Citations call → lib/findings.json
```
